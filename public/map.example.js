(function () {
  /**
   * Nan Map 的浏览器侧地图桥接层。
   *
   * React 侧只通过 window.map 调用这里暴露的少量方法，不直接依赖高德
   * AMap 对象。这样做有三个目的：
   *
   * 1. 把高德 Loader、key、securityJsCode 和插件初始化集中在一个文件里。
   * 2. 隔离高德返回数据结构的差异，把点位、搜索、路线规划统一成应用自己的数据格式。
   * 3. 后续如果对本文件做 VM 加密或替换地图供应商，React 组件层不用大面积改动。
   *
   * 注意：public 目录下的 JS 会被浏览器直接访问。当前 key 放在这里是按你的
   * 本地开发/后续加固方案处理，生产仍建议配合高德控制台域名白名单。
   */
  var AMAP_CONFIG = {
    // 构建时由 scripts/generate-map-config.mjs 注入，不要直接提交真实值。
    key: "__GD_MAP_KEY__",
    // 高德安全密钥。Loader 加载前会写入 window._AMapSecurityConfig。
    securityJsCode: "__GD_MAP_SECURITY__",
    // 高德 JSAPI 版本。当前桥接层按 2.0 的 Loader 和插件形态编写。
    version: "2.0",
    // 首屏需要的基础插件。路线和搜索函数里仍会二次 ensure，避免懒加载失败。
    plugins: [
      "AMap.Scale",
      "AMap.ToolBar",
      "AMap.Driving",
      "AMap.Transfer",
      "AMap.Walking",
      "AMap.Riding",
      "AMap.PlaceSearch",
      "AMap.DistrictSearch",
    ],
    // 地图默认中心点：上海人民广场附近。React 可在 create(options) 时覆盖。
    center: [121.4737, 31.2304],
    // 默认缩放级别。只作为初始视野，后续 fitView 会按点位/定位自动调整。
    zoom: 13,
    // 默认地图样式。保持真实高德标准图，不做 CSS 假地图兜底。
    mapStyle: "amap://styles/normal",
  };

  // 高德官方 Loader 地址。本文件自己注入 script，页面无需额外写 <script>。
  var AMAP_LOADER_SRC = "https://webapi.amap.com/loader.js";
  // 高德插件加载最长等待时间，避免插件回调异常时 React 一直停在 loading。
  var AMAP_PLUGIN_TIMEOUT = 8000;
  // 高德行政区查询最长等待时间；城市列表依赖它，必须保证 Promise 一定会结束。
  var AMAP_DISTRICT_SEARCH_TIMEOUT = 10000;
  // 读取当前城市仅用于优化默认选中项，超时后回落上海，不阻塞城市列表展示。
  var AMAP_CURRENT_CITY_TIMEOUT = 1200;
  // 全国地级城市数量应明显超过该值，低于它时说明一次性行政区结果不完整。
  var MIN_EXPECTED_CITY_COUNT = 300;
  // setFitView 的默认边距，顺序为 [top, right, bottom, left]。
  var DEFAULT_FIT_VIEW_PADDING = [90, 140, 90, 440];
  // 省级行政区里实际承担城市搜索范围的直辖市和特别行政区。
  var DIRECT_ADMIN_CITY_NAMES = [
    "北京市",
    "天津市",
    "上海市",
    "重庆市",
    "香港特别行政区",
    "澳门特别行政区",
  ];
  // 地名里常见多音字的城市首字母修正。
  var CITY_INITIAL_BY_FIRST_CHAR = {
    朝: "C",
    长: "C",
    厦: "X",
    重: "C",
  };
  // 用中文拼音排序边界估算城市首字母；I、U、V 在中文拼音城市首字母里通常不会出现。
  var CITY_INITIAL_BOUNDARIES = [
    { initial: "A", text: "阿" },
    { initial: "B", text: "八" },
    { initial: "C", text: "擦" },
    { initial: "D", text: "搭" },
    { initial: "E", text: "蛾" },
    { initial: "F", text: "发" },
    { initial: "G", text: "噶" },
    { initial: "H", text: "哈" },
    { initial: "J", text: "击" },
    { initial: "K", text: "喀" },
    { initial: "L", text: "拉" },
    { initial: "M", text: "妈" },
    { initial: "N", text: "拿" },
    { initial: "O", text: "哦" },
    { initial: "P", text: "啪" },
    { initial: "Q", text: "期" },
    { initial: "R", text: "然" },
    { initial: "S", text: "撒" },
    { initial: "T", text: "塌" },
    { initial: "W", text: "挖" },
    { initial: "X", text: "西" },
    { initial: "Y", text: "压" },
    { initial: "Z", text: "匝" },
  ];

  // 当前唯一地图实例。create() 会先 destroy()，保证页面上始终只有一个活动实例。
  var mapInstance = null;
  // 高德 AMap 命名空间，load() 成功后缓存，供后续 Marker/Route/Search 使用。
  var AMapRuntime = null;
  // Loader script 注入 Promise，避免多次并发调用 load() 时重复插入 script。
  var loaderScriptPromise;
  // AMapLoader.load Promise，保证高德运行时只初始化一次。
  var amapPromise;
  // 当前由 setMarkers() 创建的高德 Marker 覆盖物集合。
  var markerOverlays = [];
  // markerId -> marker data 的索引，用于 focusMarker 和事件回调。
  var markerDataById = {};
  // 地图 click 事件只绑定一次，防止 React 重新渲染造成重复回调。
  var mapClickEventBound = false;
  // React 注入的地图空白点击回调。当前业务不通过地图点击改点位，只保留扩展位。
  var mapClickHandler;
  // 路线点击会冒泡到地图点击，这个短暂 guard 用来吞掉同一次点击的地图事件。
  var routeClickGuard = false;
  // React 注入的路线点击回调，用于打开/切换指定路线详情面板。
  var routeClickHandler;
  // React 注入的地图视图变化回调，用于驱动白板层重新投影坐标。
  var mapViewportChangeHandler;
  // 地图 move/zoom 事件可能高频触发，用 requestAnimationFrame 合并通知。
  var mapViewportChangeFrame = 0;
  // 当前绘制在地图上的路线覆盖物集合，主要由 setRoutes() 统一维护。
  var routeRenderers = [];
  // 当前可参与 fitView 的路线覆盖物，不包含选中高亮 halo 这类纯视觉层。
  var routeFitOverlays = [];
  // routeId -> 可参与 fitView 的路线覆盖物，用于选中线路时只聚焦当前线路。
  var routeFitOverlaysById = {};
  // 路线请求版本号。切换交通方式或重新规划时递增，用来让旧请求自动失效。
  var routeRequestVersion = 0;
  // 定位精度圈覆盖物。
  var userAccuracyOverlay = null;
  // 当前定位点覆盖物。
  var userLocationOverlay = null;
  // 高德行政区城市列表缓存，避免每次打开搜索框都重复请求。
  var cityListPromise = null;

  /**
   * 加载并缓存高德运行时。
   *
   * 对外暴露为 window.map.load()。所有依赖 AMapRuntime 的能力都先走这里：
   * 验证配置 -> 设置安全密钥 -> 注入 Loader -> 调用 AMapLoader.load。
   * 返回同一个 Promise，方便多个调用方同时等待地图能力就绪。
   */
  function load() {
    if (amapPromise) {
      return amapPromise;
    }

    amapPromise = Promise.resolve()
      .then(function () {
        validateConfig();
        window._AMapSecurityConfig = {
          securityJsCode: AMAP_CONFIG.securityJsCode.trim(),
        };

        return ensureAmapLoaderScript();
      })
      .then(function () {
        if (!window.AMapLoader) {
          throw new Error("高德地图 Loader 加载失败");
        }

        return window.AMapLoader.load({
          key: AMAP_CONFIG.key.trim(),
          version: AMAP_CONFIG.version,
          plugins: AMAP_CONFIG.plugins,
        });
      })
      .then(function (AMap) {
        var amapRuntimeConfig =
          typeof AMap.getConfig === "function" ? AMap.getConfig() : null;

        if (amapRuntimeConfig) {
          amapRuntimeConfig.appname = "nan-map";
        }

        AMapRuntime = AMap;
        return AMapRuntime;
      });

    return amapPromise;
  }

  /**
   * 创建地图实例并绑定基础控件/事件。
   *
   * React 的 MapLayer 在容器 DOM 可用时调用。这里先 destroy() 旧实例，避免开发
   * 热更新或页面重新挂载后出现多个高德地图实例抢同一个容器。
   */
  function create(container, options) {
    if (!container) {
      return Promise.reject(new Error("地图容器不存在"));
    }

    return load().then(function (AMap) {
      destroy();

      var resolvedOptions = resolveMapOptions(options);

      mapInstance = new AMap.Map(container, {
        animateEnable: true,
        center: resolvedOptions.center,
        dragEnable: true,
        keyboardEnable: true,
        mapStyle: resolvedOptions.mapStyle,
        resizeEnable: true,
        scrollWheel: true,
        viewMode: "2D",
        zoomEnable: true,
        zoom: resolvedOptions.zoom,
      });

      addControl(AMap.Scale);
      addControl(AMap.ToolBar);
      bindMapEvents();

      return mapInstance;
    });
  }

  /**
   * 以当前 React marker 数据重建地图点位。
   *
   * 这里使用高德 Marker + 自定义 HTML content，而不是 React DOM 直接盖在地图上。
   * 这样拖动、视野适配、zIndex 和地图缩放都交给高德处理；React 只接收点击和
   * dragend 的最终经纬度。锁定点位会被设置为不可拖动。
   */
  function setMarkers(markers, options) {
    var nextMarkers = Array.isArray(markers) ? markers : [];
    var onMarkerDragEnd = options && options.onMarkerDragEnd;
    var selectedMarkerId = options && options.selectedMarkerId;
    var onMarkerClick = options && options.onMarkerClick;

    if (!mapInstance || !AMapRuntime) {
      return [];
    }

    clearMarkers();
    markerDataById = {};

    markerOverlays = nextMarkers
      .filter(function (marker) {
        return isLngLat(marker && marker.lngLat);
      })
      .map(function (marker, index) {
        var content = createMarkerContent(
          marker,
          marker.id === selectedMarkerId,
          onMarkerClick,
          index + 1,
        );
        var markerOverlay = new AMapRuntime.Marker({
          anchor: "center",
          content: content,
          cursor: marker.locked ? "pointer" : "grab",
          draggable: !marker.locked,
          position: marker.lngLat,
          raiseOnDrag: true,
          title: marker.name,
        });

        markerDataById[marker.id] = marker;
        markerOverlay.on("click", function () {
          selectMarker(marker.id, onMarkerClick);
        });

        if (!marker.locked) {
          bindMarkerDrag(markerOverlay, marker, content, {
            onMarkerClick: onMarkerClick,
            onMarkerDragEnd: onMarkerDragEnd,
          });
        }

        mapInstance.add(markerOverlay);
        return markerOverlay;
      });

    return markerOverlays;
  }

  /**
   * 用高德 Polyline 绘制指定路线 path。
   *
   * 这里不做直线兜底，path 必须来自高德路线规划返回的候选方案；用户在面板里
   * 选择不同候选路线时，React 会把对应 path 传回来，让地图路线同步切换。
   * options.selected 为 true 时会额外叠一层同 path 高亮线；高亮线禁用点击，
   * 避免选中后扩大的视觉层继续捕获鼠标事件。
   */
  function setRoute(path, options) {
    var safeOptions = options || {};
    var overlays = setRoutes(
      [
        {
          id: "active-route",
          color: safeOptions.color,
          mode: safeOptions.mode,
          path: path,
          selected: safeOptions.selected,
        },
      ],
      Object.assign({}, safeOptions, {
        fitView: safeOptions.fitView !== false,
      }),
    );

    return overlays[0] || null;
  }

  /**
   * 批量绘制所有已保存路线。
   *
   * React 会把已经规划成功的线路集合传进来。这里每次统一清理旧路线覆盖物，
   * 再按集合重建，保证“旧线路保留、当前编辑线路更新”的状态完全由 React 控制。
   */
  function setRoutes(routes, options) {
    var safeRoutes = toArray(routes);
    var safeOptions = options || {};
    var nextRouteRenderers = [];
    var nextRouteFitOverlays = [];
    var nextRouteFitOverlaysById = {};

    if (!mapInstance || !AMapRuntime) {
      return [];
    }

    clearRoute();

    safeRoutes.forEach(function (route, index) {
      var routeId =
        route && hasText(route.id) ? route.id.trim() : "route-" + index;
      var routePath =
        route && Array.isArray(route.path) ? route.path.filter(isLngLat) : [];
      var routeMode = (route && route.mode) || safeOptions.mode;
      var routeColor = route && hasText(route.color) ? route.color.trim() : "";
      var routeSelected =
        Boolean(route && route.selected) || safeOptions.selectedRouteId === routeId;

      if (routePath.length < 2) {
        return;
      }

      var routeStyle = resolveRoutePolylineStyle(
        routeMode,
        routeSelected,
        routeColor,
      );

      if (routeSelected) {
        var routeHalo = new AMapRuntime.Polyline({
          bubble: true,
          clickable: false,
          cursor: "default",
          lineJoin: "round",
          lineCap: "round",
          path: routePath,
          strokeColor: "#0f172a",
          strokeOpacity: 0.18,
          strokeStyle: routeStyle.strokeStyle,
          strokeWeight: (routeStyle.strokeWeight || 7) + 8,
          zIndex: 23,
        });

        mapInstance.add(routeHalo);
        nextRouteRenderers.push(routeHalo);
      }

      var polyline = new AMapRuntime.Polyline(
        Object.assign(
          {
            bubble: true,
            cursor: routeSelected ? "default" : "pointer",
            lineJoin: "round",
            lineCap: "round",
            path: routePath,
            zIndex: routeSelected ? 24 : 18,
          },
          routeStyle,
        ),
      );

      bindRouteRendererClick(polyline, routeId);
      mapInstance.add(polyline);
      nextRouteRenderers.push(polyline);
      nextRouteFitOverlays.push(polyline);
      nextRouteFitOverlaysById[routeId] = [polyline];
    });

    routeRenderers = nextRouteRenderers;
    routeFitOverlays = nextRouteFitOverlays;
    routeFitOverlaysById = nextRouteFitOverlaysById;

    if (safeOptions.fitView && nextRouteFitOverlays.length > 0) {
      mapInstance.setFitView(
        nextRouteFitOverlays,
        false,
        resolveFitViewPadding(safeOptions.padding),
        15,
      );
    }

    return nextRouteFitOverlays;
  }

  /**
   * 根据当前点位、定位点和精度圈适配地图视野。
   *
   * React 会把面板展开状态换算成 padding 传入，避免面板挡住关键点位或路线。
   */
  function fitView(options) {
    if (!mapInstance) {
      return;
    }

    var routeId =
      options && hasText(options.routeId) ? options.routeId.trim() : "";
    var targetRouteOverlays = routeId ? routeFitOverlaysById[routeId] : null;
    var overlays =
      targetRouteOverlays && targetRouteOverlays.length > 0
        ? targetRouteOverlays
        : markerOverlays
            .concat(userLocationOverlay ? [userLocationOverlay] : [])
            .concat(userAccuracyOverlay ? [userAccuracyOverlay] : [])
            .concat(routeFitOverlays);

    if (overlays.length > 0) {
      mapInstance.setFitView(
        overlays,
        false,
        resolveFitViewPadding(options && options.padding),
        15,
      );
    }
  }

  /**
   * 平移地图到指定点位。
   *
   * 优先使用 panTo 保持平滑移动；如果运行时不支持则退回 setCenter。
   */
  function focusMarker(markerId) {
    var marker = markerDataById[markerId];

    if (!mapInstance || !marker || !isLngLat(marker.lngLat)) {
      return;
    }

    focusLngLat(marker.lngLat);
  }

  /**
   * 平移地图到指定经纬度。
   *
   * 用于搜索结果 hover/focus 预览。它只改变地图视野，不修改 React 点位坐标。
   */
  function focusLngLat(lngLat, options) {
    if (!mapInstance || !isLngLat(lngLat)) {
      return;
    }

    var zoom =
      options && isFiniteNumber(options.zoom)
        ? Math.max(3, Math.min(Math.round(options.zoom), 20))
        : undefined;

    if (zoom !== undefined && typeof mapInstance.setZoomAndCenter === "function") {
      mapInstance.setZoomAndCenter(zoom, lngLat);
      return;
    }

    if (zoom !== undefined && typeof mapInstance.setZoom === "function") {
      mapInstance.setZoom(zoom);
    }

    if (typeof mapInstance.panTo === "function") {
      mapInstance.panTo(lngLat);
      return;
    }

    if (typeof mapInstance.setCenter === "function") {
      mapInstance.setCenter(lngLat);
    }
  }

  /**
   * 注入 React 层的地图交互回调。
   *
   * 事件绑定本身在 bindMapEvents() 里只做一次，这里只替换闭包里的 handler，
   * 可以避免每次组件状态变化都解绑/重绑高德事件。
   */
  function setInteractionHandlers(handlers) {
    mapClickHandler = handlers && handlers.onMapClick;
    routeClickHandler = handlers && handlers.onRouteClick;
    mapViewportChangeHandler = handlers && handlers.onViewportChange;
  }

  /**
   * 绘制用户当前位置和可选精度圈。
   *
   * 每次调用都会先清理旧定位覆盖物，因为浏览器 watchPosition 可能持续推送新的
   * 经纬度。精度圈半径做了上限，避免一次低精度定位把整张地图涂满。
   */
  function setUserLocation(lngLat, options) {
    clearUserLocation();

    if (!mapInstance || !AMapRuntime || !isLngLat(lngLat)) {
      return null;
    }

    var accuracy =
      options && typeof options.accuracy === "number" ? options.accuracy : 0;

    if (accuracy > 0 && AMapRuntime.Circle) {
      userAccuracyOverlay = new AMapRuntime.Circle({
        bubble: true,
        center: lngLat,
        fillColor: "#2563eb",
        fillOpacity: 0.08,
        radius: Math.max(12, Math.min(accuracy, 500)),
        strokeColor: "#2563eb",
        strokeOpacity: 0.28,
        strokeWeight: 1,
        zIndex: 8,
      });
      mapInstance.add(userAccuracyOverlay);
    }

    userLocationOverlay = new AMapRuntime.Marker({
      anchor: "center",
      content: createUserLocationContent(),
      cursor: "default",
      position: lngLat,
      title: "当前位置",
      zIndex: 30,
    });
    mapInstance.add(userLocationOverlay);
    return userLocationOverlay;
  }

  /**
   * 规划并返回路线。
   *
   * 这是 React 路线面板使用的核心接口。输入点位数组和交通方式，输出统一的
   * MapRoutePlanResult。真实道路 path 来自高德 Driving/Transfer/Walking/Riding；
   * 本函数不直接管理地图覆盖物，避免规划新线路时清掉已经保存的旧线路。
   */
  function planRoute(options) {
    var safeOptions = options || {};
    var mode = normalizeRouteMode(safeOptions.mode);
    var city = hasText(safeOptions.city) ? safeOptions.city.trim() : "全国";
    var points = normalizeRoutePoints(safeOptions.points);

    if (points.length < 2) {
      return Promise.reject(new Error("至少需要两个点位才能规划路线"));
    }

    var requestVersion = routeRequestVersion + 1;
    routeRequestVersion = requestVersion;

    return load().then(function () {
      if (!isActiveRouteRequest(requestVersion)) {
        throw new Error("路线规划已更新");
      }

      if (mode === "drive") {
        return planDrivingRoute(points, city, requestVersion);
      }

      return planSegmentedRoute(mode, points, city, requestVersion);
    });
  }

  /**
   * 获取当前地图中心所在城市。
   *
   * 用于地点搜索的默认城市。拿不到城市时返回上海，保证搜索框有稳定默认值。
   */
  function getCurrentCity() {
    return load().then(function () {
      if (!mapInstance || typeof mapInstance.getCity !== "function") {
        return "上海";
      }

      return new Promise(function (resolve) {
        var settled = false;
        var timeoutId = window.setTimeout(function () {
          finish("上海");
        }, AMAP_CURRENT_CITY_TIMEOUT);

        function finish(result) {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timeoutId);
          resolve(resolveCityName(result) || "上海");
        }

        try {
          mapInstance.getCity(finish);
        } catch {
          finish("上海");
        }
      });
    });
  }

  /**
   * 按城市名切换地图中心。
   *
   * React 侧城市下拉列表选中城市时调用。若当前地图中心已经在该城市，则不重复跳转。
   */
  function setCity(city) {
    var cityName = hasText(city) ? city.trim() : "";

    if (!cityName) {
      return Promise.reject(new Error("请选择城市"));
    }

    return load().then(function () {
      if (!mapInstance || typeof mapInstance.setCity !== "function") {
        throw new Error("当前地图不支持城市跳转");
      }

      return getCurrentCity().then(function (currentCity) {
        if (isSameCityName(currentCity, cityName)) {
          return currentCity;
        }

        return new Promise(function (resolve, reject) {
          var settled = false;

          function finish(result) {
            if (settled) {
              return;
            }

            settled = true;
            resolve(resolveCityName(result) || cityName);
          }

          try {
            var maybePromise = mapInstance.setCity(cityName, finish);

            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.then(finish, reject);
              return;
            }

            window.setTimeout(function () {
              finish(cityName);
            }, 320);
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  /**
   * 通过高德行政区服务获取全国城市列表。
   *
   * 这里使用 AMap.DistrictSearch 查询“中国”的下两级行政区，再把高德返回的
   * province/city/district 树压成 React 搜索面板需要的城市数组。结果会缓存在
   * cityListPromise 中，避免用户反复展开城市 popover 时重复请求高德接口。
   */
  function getCities() {
    if (cityListPromise) {
      return cityListPromise;
    }

    cityListPromise = load()
      .then(function () {
        return ensureRoutePlugin("AMap.DistrictSearch", "DistrictSearch");
      })
      .then(queryAmapCities)
      .catch(function (error) {
        cityListPromise = null;
        throw error;
      });

    return cityListPromise;
  }

  /**
   * 执行高德行政区查询。
   */
  function queryAmapCities() {
    return queryAmapCountryDistrictForCities().then(function (countryResult) {
      var countryCities = normalizeDistrictCityResults([countryResult]);

      if (countryCities.length >= MIN_EXPECTED_CITY_COUNT) {
        return countryCities;
      }

      var provinces = extractProvinceDistricts(countryResult);

      return queryAmapProvinceCities(provinces).then(function (provinceResults) {
        var cities = normalizeDistrictCityResults(
          [countryResult].concat(provinceResults),
        );

        if (cities.length === 0) {
          throw new Error("高德没有返回城市列表");
        }

        return cities;
      });
    });
  }

  /**
   * 优先一次性获取“中国 -> 省 -> 市”的二级行政区树。
   *
   * 如果当前高德环境不支持或返回失败，则退回只取省级节点，再由后续省份查询补全。
   */
  function queryAmapCountryDistrictForCities() {
    return queryAmapDistrict("中国", {
      level: "country",
      subdistrict: 2,
    }).catch(function () {
      return queryAmapDistrict("中国", {
        level: "country",
        subdistrict: 1,
      });
    });
  }

  /**
   * 按省级行政区分批查询城市，避免一次请求拿不全全国行政区树。
   */
  function queryAmapProvinceCities(provinces) {
    var provinceQueue = toArray(provinces).filter(function (province) {
      return !isDirectAdminCityName(province && province.name);
    });
    var results = [];
    var chain = Promise.resolve();
    var batchSize = 1;

    for (var index = 0; index < provinceQueue.length; index += batchSize) {
      chain = appendProvinceCityBatch(
        chain,
        provinceQueue.slice(index, index + batchSize),
        results,
      );
    }

    return chain.then(function () {
      return results;
    });
  }

  /**
   * 追加一组省份查询任务。
   */
  function appendProvinceCityBatch(chain, batch, results) {
    return chain.then(function () {
      return Promise.all(
        batch.map(function (province) {
          return queryAmapProvinceCityList(province);
        }),
      ).then(function (batchResults) {
        batchResults.forEach(function (result) {
          results.push(result);
        });
      });
    });
  }

  /**
   * 查询单个省级行政区下的城市列表。
   *
   * 高德行政区服务对连续并发的省名查询偶尔会漏回调，因此这里优先使用
   * 省级 adcode 作为稳定关键词；如果 adcode 查询失败，再退回中文省名重试一次。
   */
  function queryAmapProvinceCityList(province) {
    var primaryKeyword = resolveDistrictKeyword(province);
    var fallbackKeyword = resolveDistrictFallbackKeyword(province, primaryKeyword);
    var options = {
      level: "province",
      subdistrict: 1,
    };

    return queryAmapDistrict(primaryKeyword, options).catch(function (error) {
      if (!fallbackKeyword) {
        throw error;
      }

      return queryAmapDistrict(fallbackKeyword, options).catch(function () {
        throw error;
      });
    });
  }

  /**
   * 执行单次高德行政区查询。
   */
  function queryAmapDistrict(keyword, options) {
    var safeOptions = options || {};
    var districtSearch = new AMapRuntime.DistrictSearch({
      extensions: "base",
      level: safeOptions.level || "country",
      subdistrict: safeOptions.subdistrict || 1,
    });

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timeoutId = window.setTimeout(function () {
        finish(
          reject,
          new Error(
            "高德行政区查询超时，请稍后重试：" + stripHtml(keyword || "城市列表"),
          ),
        );
      }, AMAP_DISTRICT_SEARCH_TIMEOUT);

      function finish(callback, value) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        callback(value);
      }

      try {
        districtSearch.search(keyword, function (status, result) {
          if (status === "complete" || status === "success") {
            finish(resolve, result);
            return;
          }

          finish(reject, new Error(resolveRouteErrorMessage(result, status)));
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  /**
   * 调用高德地点搜索并归一化 POI。
   *
   * 返回值只保留 React 点位面板需要的字段：名称、地址、城市、区县、类型和经纬度。
   * city 为“全国”时关闭 citylimit，否则限制在指定城市内搜索。
   */
  function searchPlaces(options) {
    var safeOptions = options || {};
    var keyword = hasText(safeOptions.keyword)
      ? safeOptions.keyword.trim()
      : "";
    var city = hasText(safeOptions.city) ? safeOptions.city.trim() : "全国";
    var pageSize = resolvePageSize(safeOptions.pageSize);

    if (!keyword) {
      return Promise.reject(new Error("请输入地点关键词"));
    }

    return load()
      .then(function () {
        return ensureRoutePlugin("AMap.PlaceSearch", "PlaceSearch");
      })
      .then(function () {
        var placeSearch = new AMapRuntime.PlaceSearch({
          autoFitView: false,
          city: city,
          citylimit: city !== "全国",
          extensions: "base",
          pageIndex: 1,
          pageSize: pageSize,
          panel: null,
        });

        return new Promise(function (resolve, reject) {
          placeSearch.search(keyword, function (status, result) {
            if (status === "complete" || status === "success") {
              var places = normalizePlaceSearchResult(result, city).slice(
                0,
                pageSize,
              );

              resolve({
                city: city,
                keyword: keyword,
                message:
                  places.length > 0
                    ? "找到 " + places.length + " 个地点"
                    : "没有找到匹配地点",
                places: places,
                source: "amap",
              });
              return;
            }

            if (status === "no_data") {
              resolve({
                city: city,
                keyword: keyword,
                message: "没有找到匹配地点",
                places: [],
                source: "amap",
              });
              return;
            }

            reject(new Error(resolveRouteErrorMessage(result)));
          });
        });
      });
  }

  /**
   * 销毁地图实例和所有覆盖物。
   *
   * targetInstance 用于 React effect 清理：只有传入实例仍是当前实例时才销毁，
   * 避免旧 effect 的清理误伤新创建的地图。
   */
  function destroy(targetInstance) {
    if (targetInstance && targetInstance !== mapInstance) {
      return;
    }

    if (!mapInstance) {
      markerOverlays = [];
      routeRenderers = [];
      routeFitOverlays = [];
      routeFitOverlaysById = {};
      return;
    }

    clearMarkers();
    clearRoute();
    clearUserLocation();
    unbindMapEvents();
    mapInstance.destroy();
    mapInstance = null;
  }

  /**
   * 清空点位覆盖物和点位索引。
   */
  function clearMarkers() {
    if (mapInstance && markerOverlays.length > 0) {
      mapInstance.remove(markerOverlays);
    }

    markerOverlays = [];
    markerDataById = {};
    clearMarkerDragState();
  }

  /**
   * 清空当前路线。
   *
   * routeRenderers 里保存的是路线覆盖物；旧版本也可能残留高德路线服务实例，
   * 具体清理方式交给 clearRouteRenderer() 兼容。
   */
  function clearRoute() {
    routeRenderers.forEach(clearRouteRenderer);
    routeRenderers = [];
    routeFitOverlays = [];
    routeFitOverlaysById = {};
  }

  /**
   * 清理单个路线渲染器。
   *
   * 高德不同路线插件暴露的清理 API 不完全一致：有的有 clear()，有的需要从 map
   * 上 remove，所以这里做统一兜底。
   */
  function clearRouteRenderer(renderer) {
    if (!renderer) {
      return;
    }

    if (
      typeof renderer.off === "function" &&
      typeof renderer.__nanRouteClickHandler === "function"
    ) {
      renderer.off("click", renderer.__nanRouteClickHandler);
      renderer.__nanRouteClickHandler = undefined;
    }

    if (typeof renderer.clear === "function") {
      renderer.clear();
      return;
    }

    if (mapInstance) {
      mapInstance.remove(renderer);
    }
  }

  /**
   * 绑定路线点击事件，供 React 打开路线详情面板。
   */
  function bindRouteRendererClick(renderer, routeId) {
    if (renderer && typeof renderer.on === "function") {
      var clickHandler = function () {
        handleRouteClick(routeId);
      };

      renderer.__nanRouteClickHandler = clickHandler;
      renderer.on("click", clickHandler);
    }
  }

  /**
   * 清空定位点和精度圈。
   */
  function clearUserLocation() {
    var overlays = []
      .concat(userLocationOverlay ? [userLocationOverlay] : [])
      .concat(userAccuracyOverlay ? [userAccuracyOverlay] : []);

    if (mapInstance && overlays.length > 0) {
      mapInstance.remove(overlays);
    }

    userAccuracyOverlay = null;
    userLocationOverlay = null;
  }

  /**
   * 添加高德地图控件。
   *
   * 兼容 addControl 和 add 两种写法，方便插件对象在不同版本里表现不一致时仍可用。
   */
  function addControl(Control) {
    if (!Control || !mapInstance) {
      return;
    }

    var control = new Control();

    if (typeof mapInstance.addControl === "function") {
      mapInstance.addControl(control);
      return;
    }

    mapInstance.add(control);
  }

  /**
   * 绑定地图级事件。
   */
  function bindMapEvents() {
    if (!mapInstance || mapClickEventBound || typeof mapInstance.on !== "function") {
      return;
    }

    mapInstance.on("click", handleMapClick);
    mapInstance.on("mapmove", handleMapViewportChange);
    mapInstance.on("moveend", handleMapViewportChange);
    mapInstance.on("zoomchange", handleMapViewportChange);
    mapInstance.on("zoomend", handleMapViewportChange);
    mapClickEventBound = true;
  }

  /**
   * 解绑地图级事件，并清空 React 注入的 handler。
   */
  function unbindMapEvents() {
    if (mapInstance && mapClickEventBound && typeof mapInstance.off === "function") {
      mapInstance.off("click", handleMapClick);
      mapInstance.off("mapmove", handleMapViewportChange);
      mapInstance.off("moveend", handleMapViewportChange);
      mapInstance.off("zoomchange", handleMapViewportChange);
      mapInstance.off("zoomend", handleMapViewportChange);
    }

    mapClickEventBound = false;
    mapClickHandler = undefined;
    routeClickGuard = false;
    routeClickHandler = undefined;
    mapViewportChangeHandler = undefined;

    if (mapViewportChangeFrame) {
      window.cancelAnimationFrame(mapViewportChangeFrame);
      mapViewportChangeFrame = 0;
    }
  }

  /**
   * 地图空白点击处理。
   *
   * routeClickGuard 为 true 时说明刚刚点到了路线，此时不再触发地图点击逻辑。
   */
  function handleMapClick(event) {
    if (routeClickGuard) {
      return;
    }

    var lngLat = toLngLatArray(event && event.lnglat);

    if (lngLat && typeof mapClickHandler === "function") {
      mapClickHandler(lngLat);
    }
  }

  /**
   * 路线点击处理。
   *
   * 用一个短暂 guard 避开高德内部派发的地图 click，但不阻断原始事件冒泡；
   * 这样点击线路后地图仍能正常接管鼠标移动和拖拽，不会产生吸附感。
   */
  function handleRouteClick(routeId) {
    routeClickGuard = true;
    window.setTimeout(function () {
      routeClickGuard = false;
    }, 80);

    if (typeof routeClickHandler === "function") {
      routeClickHandler(routeId);
    }
  }

  /**
   * 地图视图变化处理。
   *
   * 白板对象保存的是经纬度，地图平移/缩放后需要通知 React 重新换算到 Konva
   * 屏幕坐标。这里合并到下一帧，避免高频地图事件导致 React 过度渲染。
   */
  function handleMapViewportChange() {
    if (
      typeof mapViewportChangeHandler !== "function" ||
      mapViewportChangeFrame
    ) {
      return;
    }

    mapViewportChangeFrame = window.requestAnimationFrame(function () {
      mapViewportChangeFrame = 0;

      if (typeof mapViewportChangeHandler === "function") {
        mapViewportChangeHandler();
      }
    });
  }

  /**
   * 将高德经纬度转换为地图容器像素坐标。
   */
  function lngLatToContainer(lngLat) {
    if (
      !mapInstance ||
      !isLngLat(lngLat) ||
      typeof mapInstance.lngLatToContainer !== "function"
    ) {
      return null;
    }

    return toContainerPointArray(mapInstance.lngLatToContainer(lngLat));
  }

  /**
   * 将地图容器像素坐标转换为高德经纬度。
   */
  function containerToLngLat(point) {
    if (
      !mapInstance ||
      !isContainerPoint(point) ||
      typeof mapInstance.containerToLngLat !== "function"
    ) {
      return null;
    }

    var pixel =
      AMapRuntime && AMapRuntime.Pixel
        ? new AMapRuntime.Pixel(point[0], point[1])
        : point;

    return toLngLatArray(mapInstance.containerToLngLat(pixel));
  }

  /**
   * 获取当前地图中心和缩放级别。
   *
   * 导入导出模块用它保存当前视野；这里不包含覆盖物数据，点位、路线和白板对象
   * 仍由 React 状态模板独立保存。
   */
  function getViewport() {
    if (!mapInstance) {
      return null;
    }

    var center =
      typeof mapInstance.getCenter === "function"
        ? toLngLatArray(mapInstance.getCenter())
        : null;
    var zoom =
      typeof mapInstance.getZoom === "function" ? mapInstance.getZoom() : null;

    if (!center || !isFiniteNumber(zoom)) {
      return null;
    }

    return {
      center: center,
      zoom: Math.max(3, Math.min(Number(zoom.toFixed(2)), 20)),
    };
  }

  /**
   * 恢复导入模板里的地图视野。
   */
  function setViewport(viewport) {
    if (!mapInstance || !viewport || !isLngLat(viewport.center)) {
      return;
    }

    var zoom = isFiniteNumber(viewport.zoom)
      ? Math.max(3, Math.min(Number(viewport.zoom), 20))
      : undefined;

    if (
      zoom !== undefined &&
      typeof mapInstance.setZoomAndCenter === "function"
    ) {
      mapInstance.setZoomAndCenter(zoom, viewport.center);
      return;
    }

    if (zoom !== undefined && typeof mapInstance.setZoom === "function") {
      mapInstance.setZoom(zoom);
    }

    if (typeof mapInstance.setCenter === "function") {
      mapInstance.setCenter(viewport.center);
    }
  }

  /**
   * 给未锁定点位绑定拖拽事件。
   *
   * 业务要求点位位置只能通过拖动改变，所以这里仅在 dragend 时把最终经纬度回传。
   */
  function bindMarkerDrag(markerOverlay, marker, content, handlers) {
    markerOverlay.on("dragstart", function () {
      setMarkerDragState(content, true);
      selectMarker(marker.id, handlers.onMarkerClick);
    });
    markerOverlay.on("dragend", function (event) {
      var lngLat =
        toLngLatArray(event && event.lnglat) ||
        toLngLatArray(
          typeof markerOverlay.getPosition === "function"
            ? markerOverlay.getPosition()
            : null,
        );

      setMarkerDragState(content, false);

      if (lngLat && typeof handlers.onMarkerDragEnd === "function") {
        handlers.onMarkerDragEnd(marker.id, lngLat);
      }
    });
  }

  /**
   * 设置拖拽中的样式状态。
   *
   * content 上的 class 控制当前 marker 外观，body class 控制地图层整体 cursor。
   */
  function setMarkerDragState(content, dragging) {
    if (content && content.classList) {
      content.classList.toggle("amap-html-marker-dragging", dragging);
    }

    if (document.body) {
      document.body.classList.toggle("is-dragging-map-marker", dragging);
    }
  }

  /**
   * 清除全局拖拽样式，避免拖拽过程中点位被重建后 cursor 残留。
   */
  function clearMarkerDragState() {
    if (document.body) {
      document.body.classList.remove("is-dragging-map-marker");
    }
  }

  /**
   * 注入并复用高德 Loader script。
   *
   * 如果页面里已经存在 data-amap-loader 的 script，会监听它的 load/error；
   * 否则创建一个新的 script。这样可以兼容未来手动预加载 Loader 的场景。
   */
  function ensureAmapLoaderScript() {
    if (window.AMapLoader) {
      return Promise.resolve();
    }

    if (loaderScriptPromise) {
      return loaderScriptPromise;
    }

    loaderScriptPromise = new Promise(function (resolve, reject) {
      var existingScript = document.querySelector("script[data-amap-loader]");

      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener(
          "error",
          function () {
            reject(new Error("高德地图 Loader 加载失败"));
          },
          { once: true },
        );
        return;
      }

      var script = document.createElement("script");
      script.async = true;
      script.dataset.amapLoader = "true";
      script.src = AMAP_LOADER_SRC;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        function () {
          reject(new Error("高德地图 Loader 加载失败"));
        },
        { once: true },
      );
      document.head.appendChild(script);
    });

    return loaderScriptPromise;
  }

  /**
   * 驾车路线规划。
   *
   * 驾车和其他模式不同：这里会尝试多种高德 DrivingPolicy。第一条可成功绘制到
   * 地图上的路线作为可视路线，其余策略只拿结果不绘制，用来提供备选方案列表。
   */
  function planDrivingRoute(points, city, requestVersion) {
    return ensureRoutePlugin("AMap.Driving", "Driving").then(function () {
      var policies = resolveDrivingPolicies();

      return searchFirstDrivingRouteOnMap(points, policies, city, requestVersion).then(
        function (renderedPlan) {
          return Promise.all(
            policies.map(function (policy, index) {
              if (index === renderedPlan.index) {
                return renderedPlan.plan;
              }

              return searchDrivingRoute(
                points,
                policy,
                index,
                city,
                false,
                requestVersion,
              ).catch(function () {
                return null;
              });
            }),
          ).then(function (plans) {
            var validPlans = plans.filter(Boolean);

            if (validPlans.length === 0) {
              throw new Error("高德驾车路线规划失败，请稍后重试");
            }

            return createPlanResult("drive", validPlans, "高德驾车路线规划完成");
          });
        },
      );
    });
  }

  /**
   * 公交、骑行、步行的分段规划。
   *
   * 高德 Transfer/Riding/Walking 更适合两点规划；当 React 传入多个点时，这里按
   * 相邻点拆成多个 segment 分别请求，再把首选结果合并成一个应用层方案。
   */
  function planSegmentedRoute(mode, points, city, requestVersion) {
    return ensureRoutePlugin(getRoutePluginName(mode), getRouteConstructorName(mode))
      .then(function () {
        var segments = points.slice(1).map(function (point, index) {
          return {
            end: point,
            index: index,
            start: points[index],
          };
        });

        return Promise.all(
          segments.map(function (segment) {
            return searchRouteSegment(
              mode,
              segment,
              city,
              false,
              false,
              requestVersion,
            );
          }),
        );
      })
      .then(function (segmentPlanGroups) {
        if (points.length === 2) {
          var directPlans = segmentPlanGroups[0] || [];

          if (directPlans.length === 0) {
            throw new Error(getRouteModeLabel(mode) + "路线规划没有返回结果");
          }

          return createPlanResult(
            mode,
            directPlans,
            "高德" + getRouteModeLabel(mode) + "路线规划完成",
          );
        }

        var segmentPlans = segmentPlanGroups
          .map(function (plans) {
            return plans[0];
          })
          .filter(Boolean);

        if (segmentPlans.length === 0) {
          throw new Error(getRouteModeLabel(mode) + "路线规划没有返回结果");
        }

        return createPlanResult(
          mode,
          [combineSegmentPlans(mode, segmentPlans)],
          "高德" + getRouteModeLabel(mode) + "多段路线规划完成",
        );
      });
  }

  /**
   * 从多个驾车策略里找到第一条能成功返回的路线。
   *
   * 这里使用 Promise 链顺序尝试，而不是并发，避免多个策略同时回写同一个
   * 路线规划请求。
   */
  function searchFirstDrivingRouteOnMap(points, policies, city, requestVersion) {
    var attempt = Promise.reject(
      new Error("高德驾车路线规划失败，请稍后重试"),
    );

    policies.forEach(function (policy, index) {
      attempt = attempt.catch(function () {
        return searchDrivingRoute(
          points,
          policy,
          index,
          city,
          false,
          requestVersion,
        ).then(function (plan) {
          return {
            index: index,
            plan: plan,
          };
        });
      });
    });

    return attempt;
  }

  /**
   * 请求单个驾车策略。
   *
   * shouldRender 为 true 时把 Driving 实例绑定到 map，让高德负责把道路路线画到
   * 地图上；为 false 时只拿备选结果，不产生额外地图线层。
   */
  function searchDrivingRoute(
    points,
    policy,
    index,
    city,
    shouldRender,
    requestVersion,
  ) {
    var options = createRouteServiceOptions("drive", city, shouldRender, true);

    if (policy.value !== undefined) {
      options.policy = policy.value;
    }

    var driving = new AMapRuntime.Driving(options);
    var waypoints = points.slice(1, -1);
    var requestOptions =
      waypoints.length > 0
        ? {
            waypoints: waypoints,
          }
        : undefined;

    if (shouldRender) {
      routeRenderers.push(driving);
    }

    return searchWithRouteService(
      driving,
      points[0],
      points[points.length - 1],
      requestOptions,
      requestVersion,
    )
      .then(function (result) {
        var candidates = getRouteCandidates(result, "drive");
        var route = candidates[0];

        if (!route) {
          throw new Error("高德驾车路线规划没有返回结果");
        }

        return normalizeRoutePlan({
          badge: policy.badge,
          cost: toFiniteNumber(route.tolls) || toFiniteNumber(route.toll),
          costLabel: "费用",
          fallbackEnd: points[points.length - 1],
          fallbackStart: points[0],
          id: "drive-" + index,
          mode: "drive",
          plan: route,
          title: policy.title,
          warning:
            toFiniteNumber(route.restriction) === 1
              ? "该路线可能包含限行路段，请以高德实时结果和现场规则为准。"
              : undefined,
        });
      })
      .catch(function (error) {
        if (shouldRender) {
          if (isActiveRouteRequest(requestVersion)) {
            clearRoute();
          } else {
            clearRouteRenderer(driving);
          }
        }

        throw error;
      });
  }

  /**
   * 请求一个非驾车分段路线。
   *
   * mode 决定使用 Transfer/Riding/Walking 中的哪一个构造器。shouldFitView 只在
   * 最后一段为 true，避免多段路线每一段都自动调整视野造成跳动。
   */
  function searchRouteSegment(
    mode,
    segment,
    city,
    shouldRender,
    shouldFitView,
    requestVersion,
  ) {
    var Service = AMapRuntime[getRouteConstructorName(mode)];
    var service = new Service(
      createRouteServiceOptions(mode, city, shouldRender, shouldFitView),
    );

    if (shouldRender) {
      routeRenderers.push(service);
    }

    return searchWithRouteService(
      service,
      segment.start,
      segment.end,
      undefined,
      requestVersion,
    )
      .then(function (result) {
        return normalizeRoutePlans(mode, result, segment);
      })
      .catch(function (error) {
        if (shouldRender) {
          if (isActiveRouteRequest(requestVersion)) {
            clearRoute();
          } else {
            clearRouteRenderer(service);
          }
        }

        throw error;
      });
  }

  /**
   * 把高德回调式 search API 包装成 Promise。
   *
   * 每次回调前后都检查 requestVersion：如果用户已经切换交通方式或重新规划，
   * 旧请求会被拒绝，避免过期结果覆盖当前正在编辑的线路。
   */
  function searchWithRouteService(service, start, end, options, requestVersion) {
    return new Promise(function (resolve, reject) {
      if (!isActiveRouteRequest(requestVersion)) {
        clearRouteRenderer(service);
        reject(new Error("路线规划已更新"));
        return;
      }

      var done = function (status, result) {
        if (!isActiveRouteRequest(requestVersion)) {
          clearRouteRenderer(service);
          reject(new Error("路线规划已更新"));
          return;
        }

        if (status === "complete" || status === "success") {
          resolve(result || {});
          return;
        }

        reject(new Error(resolveRouteErrorMessage(result, status)));
      };

      try {
        if (options) {
          service.search(start, end, options, done);
          return;
        }

        service.search(start, end, done);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 生成高德路线服务配置。
   *
   * hideMarkers 固定为 true，避免高德默认起终点气泡和应用自己的点位标记重复。
   * shouldRender 控制是否把服务实例绑定到 map；不绑定时只查询数据，不画线。
   */
  function createRouteServiceOptions(mode, city, shouldRender, shouldFitView) {
    var serviceOptions = {
      autoFitView: Boolean(shouldRender && shouldFitView),
      extensions: "all",
      hideMarkers: true,
    };

    if (shouldRender) {
      serviceOptions.map = mapInstance;
    }

    if (mode === "drive") {
      serviceOptions.isOutline = true;
      serviceOptions.outlineColor = "#ffffff";
      serviceOptions.showTraffic = true;
    }

    if (mode === "transit") {
      serviceOptions.city = city;
      serviceOptions.policy = readPolicy("TransferPolicy", "LEAST_TIME");
    }

    return serviceOptions;
  }

  /**
   * 将高德某一次路线搜索结果归一化成最多三个应用层方案。
   *
   * 高德不同插件的候选字段名不一致，先通过 getRouteCandidates() 取候选列表，
   * 再统一成 {title, badge, distance, duration, cost, path, steps}。
   */
  function normalizeRoutePlans(mode, result, segment) {
    var candidates = getRouteCandidates(result, mode);

    return candidates.slice(0, 3).map(function (plan, index) {
      return normalizeRoutePlan({
        badge: getRoutePlanBadge(mode, index),
        cost: resolveRouteCost(mode, plan),
        costLabel: mode === "transit" ? "票价" : "费用",
        fallbackEnd: segment.end,
        fallbackStart: segment.start,
        id: mode + "-" + segment.index + "-" + index,
        mode: mode,
        plan: plan,
        title: getRoutePlanTitle(mode, plan, index),
        warning: getRoutePlanWarning(mode, plan),
      });
    });
  }

  /**
   * 归一化单条路线方案。
   *
   * 高德返回里 distance/time/path 字段可能缺失或名字不同，所以这里按优先级补齐：
   * 原始距离 -> path 估算距离 -> 起终点直线距离；原始时长 -> 模式估算时长。
   */
  function normalizeRoutePlan(options) {
    var plan = options.plan || {};
    var path = extractPlanPath(plan, options.fallbackStart, options.fallbackEnd);
    var distance =
      toFiniteNumber(plan.distance) ||
      getPathDistanceMeters(path) ||
      getPointDistanceMeters(options.fallbackStart, options.fallbackEnd);
    var duration =
      toFiniteNumber(plan.time) ||
      toFiniteNumber(plan.duration) ||
      estimateDurationSeconds(options.mode, distance);
    var steps = normalizePlanSteps(options.mode, plan, distance);

    return {
      badge: options.badge,
      cost: options.cost,
      costLabel: options.costLabel,
      distance: Math.round(distance),
      duration: Math.round(duration),
      id: options.id,
      path: path,
      steps: steps,
      title: options.title,
      warning: options.warning,
    };
  }

  /**
   * 合并多个相邻分段路线。
   *
   * 多点公交/骑行/步行会走这里。合并后的步骤会带上“第 N 段”前缀，方便面板里
   * 看出每条说明属于哪两个点位之间。
   */
  function combineSegmentPlans(mode, plans) {
    var path = [];
    var steps = [];
    var cost = 0;
    var hasCost = false;

    plans.forEach(function (plan, index) {
      appendPathValue(path, plan.path);
      steps = steps.concat(
        plan.steps.map(function (step) {
          return {
            distance: step.distance,
            duration: step.duration,
            instruction: "第 " + (index + 1) + " 段 · " + step.instruction,
          };
        }),
      );

      if (typeof plan.cost === "number") {
        cost += plan.cost;
        hasCost = true;
      }
    });

    return {
      badge: "多段",
      cost: hasCost ? cost : undefined,
      costLabel: mode === "transit" ? "票价" : "费用",
      distance: plans.reduce(function (total, plan) {
        return total + plan.distance;
      }, 0),
      duration: plans.reduce(function (total, plan) {
        return total + plan.duration;
      }, 0),
      id: mode + "-combined",
      path: path,
      steps: steps,
      title: getRouteModeLabel(mode) + "多段路线",
      warning: getCombinedRouteWarning(mode),
    };
  }

  /**
   * 创建 React 侧使用的路线规划返回值。
   */
  function createPlanResult(mode, plans, message) {
    return {
      message: message,
      mode: mode,
      path: plans[0].path,
      plans: plans,
      source: "amap",
    };
  }

  /**
   * 确保某个高德插件构造器已经可用。
   *
   * 即使 AMAP_CONFIG.plugins 里预声明了插件，仍在具体能力调用前再检查一次，
   * 这样能兼容 Loader 部分加载、后续懒加载或高德版本差异。
   */
  function ensureRoutePlugin(pluginName, constructorName) {
    if (AMapRuntime && AMapRuntime[constructorName]) {
      return Promise.resolve();
    }

    if (!AMapRuntime || typeof AMapRuntime.plugin !== "function") {
      return Promise.reject(new Error("高德地图插件加载失败"));
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timeoutId = window.setTimeout(function () {
        finish(
          reject,
          new Error("高德地图插件加载超时：" + constructorName),
        );
      }, AMAP_PLUGIN_TIMEOUT);

      function finish(callback, value) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        callback(value);
      }

      try {
        AMapRuntime.plugin([pluginName], function () {
          if (AMapRuntime[constructorName]) {
            finish(resolve);
            return;
          }

          finish(reject, new Error("高德地图插件加载失败：" + constructorName));
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  /**
   * 解析当前高德运行时支持的驾车策略。
   *
   * 部分环境可能没有暴露 DrivingPolicy 常量；这种情况下回退到默认策略，
   * 仍保证驾车规划能力可用。
   */
  function resolveDrivingPolicies() {
    var policies = [
      {
        badge: "最快",
        key: "LEAST_TIME",
        title: "最快路线",
        value: readPolicy("DrivingPolicy", "LEAST_TIME"),
      },
      {
        badge: "少收费",
        key: "LEAST_FEE",
        title: "少收费路线",
        value: readPolicy("DrivingPolicy", "LEAST_FEE"),
      },
      {
        badge: "避拥堵",
        key: "REAL_TRAFFIC",
        title: "躲避拥堵路线",
        value: readPolicy("DrivingPolicy", "REAL_TRAFFIC"),
      },
    ];
    var hasPolicyValue = policies.some(function (policy) {
      return policy.value !== undefined;
    });

    if (!hasPolicyValue) {
      return [
        {
          badge: "推荐",
          key: "DEFAULT",
          title: "推荐路线",
          value: undefined,
        },
      ];
    }

    return policies.filter(function (policy) {
      return policy.value !== undefined;
    });
  }

  /**
   * 读取高德路线候选数组。
   *
   * Driving/Walking/Riding 通常走 routes，Transfer 可能走 plans/transits。
   */
  function getRouteCandidates(result, mode) {
    if (mode === "transit") {
      return toArray(
        result && (result.plans || result.transits || result.routes),
      );
    }

    return toArray(result && (result.routes || result.plans || result.paths));
  }

  /**
   * 根据交通方式归一化路线步骤。
   */
  function normalizePlanSteps(mode, plan, distance) {
    if (mode === "transit") {
      return normalizeTransitSteps(plan, distance);
    }

    return normalizeCommonSteps(plan, distance, mode);
  }

  /**
   * 归一化驾车、步行、骑行这类普通步骤。
   *
   * 如果高德没有返回分步说明，就补一个简短兜底步骤；这里的兜底只用于面板文案，
   * 不会绘制默认直线层。
   */
  function normalizeCommonSteps(plan, distance, mode) {
    var steps = toArray(plan.steps || plan.rides || plan.walks);
    var normalizedSteps = steps
      .map(function (step, index) {
        return normalizeStep(step, getRouteModeLabel(mode) + "步骤 " + (index + 1));
      })
      .filter(function (step) {
        return hasText(step.instruction);
      });

    if (normalizedSteps.length > 0) {
      return normalizedSteps;
    }

    return [
      {
        distance: distance,
        duration: estimateDurationSeconds(mode, distance),
        instruction: getRouteModeLabel(mode) + "前往目标点",
      },
    ];
  }

  /**
   * 归一化公交/地铁/铁路/打车接驳步骤。
   *
   * Transfer 的返回结构是 segments，每段里可能同时包含 walking、bus、railway、
   * taxi，所以这里把它们拉平成面板能直接渲染的步骤列表。
   */
  function normalizeTransitSteps(plan, distance) {
    var segments = toArray(plan.segments);
    var steps = [];

    segments.forEach(function (segment) {
      var walking = segment.walking;
      var walkingDistance = walking && toFiniteNumber(walking.distance);

      if (walkingDistance) {
        steps.push({
          distance: walkingDistance,
          duration:
            toFiniteNumber(walking.time) ||
            estimateDurationSeconds("walk", walkingDistance),
          instruction: "步行 " + formatDistanceText(walkingDistance),
        });
      }

      toArray(segment.bus && segment.bus.buslines).forEach(function (busline) {
        steps.push({
          distance: toFiniteNumber(busline.distance),
          duration: toFiniteNumber(busline.time),
          instruction: buildTransitLineText("公交", busline),
        });
      });

      if (segment.railway) {
        steps.push({
          distance: toFiniteNumber(segment.railway.distance),
          duration: toFiniteNumber(segment.railway.time),
          instruction: buildRailwayText(segment.railway),
        });
      }

      if (segment.taxi) {
        steps.push({
          distance: toFiniteNumber(segment.taxi.distance),
          duration: toFiniteNumber(segment.taxi.time),
          instruction: "打车接驳 " + formatDistanceText(segment.taxi.distance),
        });
      }
    });

    if (steps.length > 0) {
      return steps;
    }

    return [
      {
        distance: distance,
        duration: estimateDurationSeconds("transit", distance),
        instruction: "公共交通组合前往目标点",
      },
    ];
  }

  /**
   * 生成公交线路说明，优先展示线路名和上下车站。
   */
  function buildTransitLineText(prefix, busline) {
    var name = stripHtml(busline.name) || prefix;
    var departureStop =
      busline.departure_stop && stripHtml(busline.departure_stop.name);
    var arrivalStop = busline.arrival_stop && stripHtml(busline.arrival_stop.name);

    if (departureStop && arrivalStop) {
      return "乘坐 " + name + "，" + departureStop + " 至 " + arrivalStop;
    }

    return "乘坐 " + name;
  }

  /**
   * 生成铁路/轨道交通说明。
   */
  function buildRailwayText(railway) {
    var name = stripHtml(railway.name) || stripHtml(railway.trip) || "轨道交通";

    return "乘坐 " + name;
  }

  /**
   * 把单个高德 step 压成稳定的应用层 step。
   */
  function normalizeStep(step, fallbackInstruction) {
    var distance = toFiniteNumber(step.distance);
    var instruction =
      stripHtml(step.instruction) ||
      stripHtml(step.road) ||
      stripHtml(step.action) ||
      fallbackInstruction;

    return {
      distance: distance,
      duration: toFiniteNumber(step.time) || toFiniteNumber(step.duration),
      instruction: instruction,
    };
  }

  /**
   * 从高德路线结果里提取 path。
   *
   * 不同插件可能把坐标放在 plan.path、polyline、steps、rides、walks、segments
   * 等位置。appendPathValue() 会递归扫描这些结构。fallback 起终点只用于结果数据
   * 完整性，不用于在地图上绘制默认直线。
   */
  function extractPlanPath(plan, fallbackStart, fallbackEnd) {
    var path = [];

    appendPathValue(path, plan && plan.path);
    appendPathValue(path, plan && plan.polyline);
    appendPathValue(path, plan && plan.steps);
    appendPathValue(path, plan && plan.rides);
    appendPathValue(path, plan && plan.walks);
    appendPathValue(path, plan && plan.segments);

    if (path.length < 2) {
      appendPathValue(path, [fallbackStart, fallbackEnd]);
    }

    return path;
  }

  /**
   * 递归追加坐标数据。
   *
   * 支持三类输入：字符串 polyline、AMap.LngLat/普通 {lng, lat}、数组或嵌套对象。
   */
  function appendPathValue(target, value) {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      value.split(";").forEach(function (part) {
        var pieces = part.split(",");

        if (pieces.length >= 2) {
          appendLngLat(target, [Number(pieces[0]), Number(pieces[1])]);
        }
      });
      return;
    }

    var lngLat = toLngLatArray(value);

    if (lngLat) {
      appendLngLat(target, lngLat);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(function (item) {
        appendPathValue(target, item);
      });
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    appendPathValue(target, value.path);
    appendPathValue(target, value.polyline);
    appendPathValue(target, value.steps);
    appendPathValue(target, value.rides);
    appendPathValue(target, value.walks);
    appendPathValue(target, value.segments);
    appendPathValue(target, value.walking);
    appendPathValue(target, value.bus && value.bus.buslines);
    appendPathValue(target, value.railway);
    appendPathValue(target, value.taxi);
  }

  /**
   * 追加坐标并去掉连续重复点。
   */
  function appendLngLat(target, lngLat) {
    if (!isLngLat(lngLat)) {
      return;
    }

    var previous = target[target.length - 1];

    if (previous && previous[0] === lngLat[0] && previous[1] === lngLat[1]) {
      return;
    }

    target.push(lngLat);
  }

  /**
   * 解析路线费用。
   *
   * 步行和骑行没有费用，返回 0；公交/驾车按高德返回的 cost/tolls/toll 读取。
   */
  function resolveRouteCost(mode, plan) {
    if (mode === "walk" || mode === "ride") {
      return 0;
    }

    return (
      toFiniteNumber(plan.cost) ||
      toFiniteNumber(plan.tolls) ||
      toFiniteNumber(plan.toll) ||
      undefined
    );
  }

  /**
   * 生成路线方案标题。
   *
   * 公交优先用线路名组合标题，步行/骑行/驾车则根据模式和候选序号生成稳定标题。
   */
  function getRoutePlanTitle(mode, plan, index) {
    if (mode === "transit") {
      var lineNames = toArray(plan.segments)
        .map(function (segment) {
          var busline = segment.bus && toArray(segment.bus.buslines)[0];

          if (busline && busline.name) {
            return stripHtml(busline.name).split("(")[0];
          }

          if (segment.railway) {
            return stripHtml(segment.railway.name) || "轨道交通";
          }

          if (segment.taxi) {
            return "打车";
          }

          return null;
        })
        .filter(Boolean)
        .slice(0, 2);

      return lineNames.length > 0
        ? lineNames.join(" + ")
        : "公共交通方案 " + (index + 1);
    }

    if (mode === "ride") {
      return index === 0 ? "自行车路线" : "骑行备选 " + (index + 1);
    }

    if (mode === "walk") {
      return index === 0 ? "步行路线" : "步行备选 " + (index + 1);
    }

    return getRouteModeLabel(mode) + "方案 " + (index + 1);
  }

  /**
   * 生成方案徽标文案。
   */
  function getRoutePlanBadge(mode, index) {
    if (mode === "transit") {
      return index === 0 ? "推荐" : "换乘 " + (index + 1);
    }

    if (mode === "ride") {
      return index === 0 ? "自行车" : "备选 " + (index + 1);
    }

    if (mode === "walk") {
      return index === 0 ? "慢行" : "备选 " + (index + 1);
    }

    return index === 0 ? "推荐" : "备选 " + (index + 1);
  }

  /**
   * 根据交通方式和方案内容生成风险提醒。
   */
  function getRoutePlanWarning(mode, plan) {
    if (mode === "ride") {
      return "高德骑行路线适用于普通骑行；摩托车或电动车可能受限行、禁行和停车规则影响。";
    }

    if (mode === "transit" && plan && plan.taxi) {
      return "该方案包含打车接驳，费用会受实时路况影响。";
    }

    return undefined;
  }

  /**
   * 多段路线合并后的统一提醒。
   */
  function getCombinedRouteWarning(mode) {
    if (mode === "ride") {
      return "多段骑行已按点位顺序规划；摩托车或电动车仍需额外核对限行规则。";
    }

    if (mode === "transit") {
      return "多段公共交通按点位顺序分别规划，换乘和等待时间以高德实时结果为准。";
    }

    return undefined;
  }

  /**
   * 校正交通方式，避免外部传入未知字符串。
   */
  function normalizeRouteMode(value) {
    return ["drive", "transit", "ride", "walk"].indexOf(value) >= 0
      ? value
      : "drive";
  }

  /**
   * 校正自定义路线颜色，只允许常见十六进制颜色进入高德 Polyline。
   */
  function normalizeRouteColor(value) {
    if (!hasText(value)) {
      return "";
    }

    var color = value.trim();

    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ? color : "";
  }

  /**
   * 根据交通方式生成备选路线重绘时的高德 Polyline 样式。
   */
  function resolveRoutePolylineStyle(mode, selected, color) {
    var routeMode = normalizeRouteMode(mode);
    var routeColor = normalizeRouteColor(color);
    var style;

    if (routeMode === "transit") {
      style = {
        isOutline: true,
        outlineColor: "#ffffff",
        showDir: true,
        strokeColor: "#7c3aed",
        strokeOpacity: 0.9,
        strokeStyle: "dashed",
        strokeWeight: 7,
      };
    } else if (routeMode === "ride") {
      style = {
        isOutline: true,
        outlineColor: "#ffffff",
        showDir: true,
        strokeColor: "#16a34a",
        strokeOpacity: 0.9,
        strokeStyle: "dashed",
        strokeWeight: 6,
      };
    } else if (routeMode === "walk") {
      style = {
        isOutline: true,
        outlineColor: "#ffffff",
        showDir: false,
        strokeColor: "#f97316",
        strokeOpacity: 0.92,
        strokeStyle: "dashed",
        strokeWeight: 6,
      };
    } else {
      style = {
        isOutline: true,
        outlineColor: "#ffffff",
        showDir: true,
        strokeColor: "#2563eb",
        strokeOpacity: 0.92,
        strokeStyle: "solid",
        strokeWeight: 7,
      };
    }

    if (routeColor) {
      style.strokeColor = routeColor;
    }

    if (!selected) {
      return style;
    }

    return Object.assign({}, style, {
      strokeOpacity: 1,
    });
  }

  /**
   * 过滤并归一化路线点位。
   */
  function normalizeRoutePoints(points) {
    return toArray(points)
      .map(toLngLatArray)
      .filter(Boolean);
  }

  /**
   * 根据应用层交通方式获取高德插件名。
   */
  function getRoutePluginName(mode) {
    if (mode === "transit") {
      return "AMap.Transfer";
    }

    if (mode === "ride") {
      return "AMap.Riding";
    }

    if (mode === "walk") {
      return "AMap.Walking";
    }

    return "AMap.Driving";
  }

  /**
   * 根据应用层交通方式获取高德构造器名。
   */
  function getRouteConstructorName(mode) {
    if (mode === "transit") {
      return "Transfer";
    }

    if (mode === "ride") {
      return "Riding";
    }

    if (mode === "walk") {
      return "Walking";
    }

    return "Driving";
  }

  /**
   * 获取中文交通方式名称。
   */
  function getRouteModeLabel(mode) {
    if (mode === "transit") {
      return "公交";
    }

    if (mode === "ride") {
      return "骑行";
    }

    if (mode === "walk") {
      return "步行";
    }

    return "驾车";
  }

  /**
   * 安全读取高德策略常量。
   */
  function readPolicy(groupName, policyName) {
    var group = AMapRuntime && AMapRuntime[groupName];

    return group && group[policyName];
  }

  /**
   * 判断路线请求是否仍是当前最新请求。
   */
  function isActiveRouteRequest(requestVersion) {
    return requestVersion === undefined || requestVersion === routeRequestVersion;
  }

  /**
   * 判断两个城市名是否可视为同一个城市。
   */
  function isSameCityName(left, right) {
    return normalizeCityName(left) === normalizeCityName(right);
  }

  /**
   * 城市名比较时去掉空格和末尾“市”，兼容“上海”和“上海市”两种返回。
   */
  function normalizeCityName(city) {
    return stripHtml(city).replace(/\s/g, "").replace(/市$/, "");
  }

  /**
   * 把高德 DistrictSearch 的行政区树压平成城市列表。
   */
  function normalizeDistrictCityResults(results) {
    var citiesByKey = {};

    toArray(results).forEach(function (result) {
      toArray(result && result.districtList).forEach(function (district) {
        collectDistrictCities(citiesByKey, district, false, null);
      });
    });

    return Object.keys(citiesByKey)
      .map(function (key) {
        return citiesByKey[key];
      })
      .sort(compareCityOptions);
  }

  /**
   * 从高德“中国”行政区结果中提取省级节点。
   */
  function extractProvinceDistricts(result) {
    var provincesByKey = {};

    toArray(result && result.districtList).forEach(function (district) {
      collectProvinceDistricts(provincesByKey, district);
    });

    return Object.keys(provincesByKey).map(function (key) {
      return provincesByKey[key];
    });
  }

  /**
   * 递归收集省级行政区，兼容 districtList 根节点是“中国”或省列表两种形态。
   */
  function collectProvinceDistricts(target, district) {
    if (!district) {
      return;
    }

    if (stripHtml(district.level) === "province") {
      target[stripHtml(String(district.adcode || district.name))] = district;
      return;
    }

    toArray(district.districtList).forEach(function (child) {
      collectProvinceDistricts(target, child);
    });
  }

  /**
   * 递归收集可用于 POI 搜索城市范围的行政区。
   */
  function collectDistrictCities(
    target,
    district,
    parentIsDirectAdminCity,
    province,
  ) {
    if (!district) {
      return;
    }

    var nextProvince =
      stripHtml(district.level) === "province"
        ? normalizeProvinceDistrict(district)
        : province;

    if (shouldUseDistrictAsCity(district, parentIsDirectAdminCity)) {
      var city = normalizeDistrictCity(district, nextProvince);

      if (city) {
        target[normalizeCityName(city.name) || city.adcode || city.name] = city;
      }
    }

    toArray(district.districtList).forEach(function (child) {
      collectDistrictCities(
        target,
        child,
        isDirectAdminCityName(district.name),
        nextProvince,
      );
    });
  }

  /**
   * 判断行政区是否应该作为城市出现在下拉列表里。
   */
  function shouldUseDistrictAsCity(district, parentIsDirectAdminCity) {
    var level = stripHtml(district && district.level);
    var name = stripHtml(district && district.name);

    if (!name || isPlaceholderDistrictName(name)) {
      return false;
    }

    if (level === "city") {
      return true;
    }

    if (level === "province") {
      return isDirectAdminCityName(name);
    }

    return (
      level === "district" &&
      !parentIsDirectAdminCity &&
      /市$/.test(name) &&
      hasText(resolveCityCode(district))
    );
  }

  /**
   * 把单个高德行政区压成 React 城市选项。
   */
  function normalizeDistrictCity(district, province) {
    var name = stripHtml(district && district.name);

    if (!name) {
      return null;
    }

    var city = {
      initial: resolveCityInitial(district),
      name: name,
    };
    var adcode = stripHtml(String((district && district.adcode) || ""));
    var center = toLngLatArray(district && district.center);
    var citycode = resolveCityCode(district);

    if (adcode) {
      city.adcode = adcode;
    }

    if (center) {
      city.center = center;
    }

    if (citycode) {
      city.citycode = citycode;
    }

    if (province && province.name) {
      city.province = province.name;
    }

    if (province && province.adcode) {
      city.provinceAdcode = province.adcode;
    }

    return city;
  }

  /**
   * 把省级行政区压成城市分组需要的省区信息。
   */
  function normalizeProvinceDistrict(district) {
    return {
      adcode: stripHtml(String((district && district.adcode) || "")),
      name: stripHtml(district && district.name),
    };
  }

  /**
   * 过滤“市辖区”“省直辖县级行政区划”等不适合作为城市选项的占位节点。
   */
  function isPlaceholderDistrictName(name) {
    return (
      name === "市辖区" ||
      name === "县" ||
      name.indexOf("直辖县级行政区划") >= 0
    );
  }

  /**
   * 行政区查询优先使用 adcode，减少同名和省名查询偶发不回调的问题。
   */
  function resolveDistrictKeyword(district) {
    return (
      stripHtml(String((district && district.adcode) || "")) ||
      stripHtml(district && district.name)
    );
  }

  /**
   * 获取行政区查询备用关键词。
   */
  function resolveDistrictFallbackKeyword(district, primaryKeyword) {
    var adcode = stripHtml(String((district && district.adcode) || ""));
    var name = stripHtml(district && district.name);
    var fallbackKeyword = primaryKeyword === adcode ? name : adcode;

    return fallbackKeyword === primaryKeyword ? "" : fallbackKeyword;
  }

  /**
   * 读取高德行政区 citycode，兼容字符串和数组。
   */
  function resolveCityCode(district) {
    var citycode = district && district.citycode;

    if (Array.isArray(citycode)) {
      citycode = citycode[0];
    }

    return stripHtml(String(citycode || ""));
  }

  /**
   * 识别直辖市和特别行政区。
   */
  function isDirectAdminCityName(name) {
    return DIRECT_ADMIN_CITY_NAMES.indexOf(stripHtml(name)) >= 0;
  }

  /**
   * 解析城市首字母。
   *
   * 高德 DistrictSearch 默认没有稳定拼音字段，因此优先读可能存在的拼音字段，
   * 缺省时用浏览器中文拼音排序规则把城市名落到 A-Z 区间。
   */
  function resolveCityInitial(district) {
    var name = stripHtml(district && district.name);
    var firstChar = name.charAt(0);
    var firstCharInitial = CITY_INITIAL_BY_FIRST_CHAR[firstChar];

    if (firstCharInitial) {
      return firstCharInitial;
    }

    var source =
      stripHtml(district && (district.initial || district.pinyinInitial)) ||
      stripHtml(district && district.pinyin).charAt(0) ||
      firstChar;
    var asciiInitial = resolveAsciiInitial(source);

    if (asciiInitial) {
      return asciiInitial;
    }

    return resolveChineseInitial(source);
  }

  /**
   * 读取英文首字母。
   */
  function resolveAsciiInitial(value) {
    var firstChar = stripHtml(value).charAt(0).toUpperCase();

    return /^[A-Z]$/.test(firstChar) ? firstChar : "";
  }

  /**
   * 根据中文拼音边界估算首字母。
   */
  function resolveChineseInitial(value) {
    var firstChar = stripHtml(value).charAt(0);

    if (!firstChar) {
      return "Z";
    }

    for (var index = CITY_INITIAL_BOUNDARIES.length - 1; index >= 0; index -= 1) {
      if (compareChineseByPinyin(firstChar, CITY_INITIAL_BOUNDARIES[index].text) >= 0) {
        return CITY_INITIAL_BOUNDARIES[index].initial;
      }
    }

    return "A";
  }

  /**
   * 城市选项排序：先按 A-Z，再按中文拼音。
   */
  function compareCityOptions(left, right) {
    if (left.initial !== right.initial) {
      return left.initial.localeCompare(right.initial);
    }

    return compareChineseByPinyin(left.name, right.name);
  }

  /**
   * 使用浏览器中文拼音排序规则比较文本；不支持时退回默认 localeCompare。
   */
  function compareChineseByPinyin(left, right) {
    try {
      return String(left).localeCompare(
        String(right),
        "zh-Hans-CN-u-co-pinyin",
      );
    } catch {
      return String(left).localeCompare(String(right));
    }
  }

  /**
   * 把高德错误结果转成面板能展示的中文错误文案。
   */
  function resolveRouteErrorMessage(result, status) {
    if (status === "no_data") {
      return "高德没有找到这组点位的可用路线，请换一种交通方式或调整点位";
    }

    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }

    return (
      (result && (result.info || result.message)) ||
      "高德路线规划失败，请稍后重试"
    );
  }

  /**
   * 归一化高德地点搜索结果。
   */
  function normalizePlaceSearchResult(result, fallbackCity) {
    var poiList = result && result.poiList;
    var pois = toArray(poiList && poiList.pois).concat(
      toArray(result && result.pois),
    );

    return pois
      .map(function (poi, index) {
        return normalizePoi(poi, index, fallbackCity);
      })
      .filter(Boolean);
  }

  /**
   * 把单个 POI 压成应用层点位搜索结果。
   */
  function normalizePoi(poi, index, fallbackCity) {
    var lngLat = toLngLatArray(
      (poi && poi.location) ||
        (poi && poi.lnglat) ||
        (poi &&
          typeof poi.lng === "number" &&
          typeof poi.lat === "number" && [poi.lng, poi.lat]),
    );

    if (!poi || !lngLat) {
      return null;
    }

    var city = resolveCityName(poi) || fallbackCity;
    var district = stripHtml(poi.adname) || stripHtml(poi.district);
    var name = stripHtml(poi.name) || "未命名地点";

    return {
      address: resolvePoiAddress(poi),
      city: city === "全国" ? "" : city,
      district: district,
      id: stripHtml(poi.id) || "poi-" + index + "-" + lngLat.join(","),
      lngLat: lngLat,
      name: name,
      type: stripHtml(poi.type),
    };
  }

  /**
   * 从 POI 中读取地址文案。
   *
   * 高德不同 POI 类型的地址字段不完全一致，所以按 address -> addressname ->
   * adname 的优先级读取。
   */
  function resolvePoiAddress(poi) {
    return (
      stripHtml(poi.address) ||
      stripHtml(poi.addressname) ||
      stripHtml(poi.adname) ||
      "暂无地址"
    );
  }

  /**
   * 从地图城市结果或 POI 对象里读取城市名。
   *
   * getCity 和 PlaceSearch 返回字段不同；这里统一支持 city、cityname、name、
   * province，并处理数组形态。
   */
  function resolveCityName(source) {
    var city =
      source &&
      (source.city || source.cityname || source.name || source.province);

    if (Array.isArray(city)) {
      city = city[0];
    }

    return stripHtml(city);
  }

  /**
   * 约束搜索分页数量。
   *
   * 点位搜索面板不需要无限结果，限制在 1 到 20 之间能避免 UI 被撑爆。
   */
  function resolvePageSize(value) {
    var pageSize = toFiniteNumber(value) || 8;

    return Math.max(1, Math.min(Math.round(pageSize), 20));
  }

  /**
   * 按 path 逐段估算总距离。
   *
   * 这是数据兜底，只用于面板指标；真实地图线段仍由高德路线服务绘制。
   */
  function getPathDistanceMeters(path) {
    if (!Array.isArray(path) || path.length < 2) {
      return 0;
    }

    return path.slice(1).reduce(function (total, point, index) {
      return total + getPointDistanceMeters(path[index], point);
    }, 0);
  }

  /**
   * 用 haversine 公式估算两个经纬度之间的球面距离。
   */
  function getPointDistanceMeters(from, to) {
    if (!isLngLat(from) || !isLngLat(to)) {
      return 0;
    }

    var earthRadius = 6371000;
    var fromLat = toRadians(from[1]);
    var toLat = toRadians(to[1]);
    var latDelta = toRadians(to[1] - from[1]);
    var lngDelta = toRadians(to[0] - from[0]);
    var a =
      Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(lngDelta / 2) *
        Math.sin(lngDelta / 2);

    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * 角度转弧度，供距离计算使用。
   */
  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  /**
   * 在高德没有返回时长时，用交通方式估算一个保守展示值。
   *
   * 这些速度只用于 UI 文案兜底，不参与地图路线绘制。
   */
  function estimateDurationSeconds(mode, distance) {
    var metersPerMinute = {
      drive: 420,
      transit: 310,
      ride: 220,
      walk: 78,
    };
    var minutes = Math.max(1, Math.round(distance / metersPerMinute[mode]));

    return minutes * 60;
  }

  /**
   * 把米格式化成适合路线步骤展示的文案。
   */
  function formatDistanceText(distance) {
    var value = toFiniteNumber(distance);

    if (!value) {
      return "";
    }

    if (value >= 1000) {
      return (value / 1000).toFixed(1) + " km";
    }

    return Math.round(value) + " m";
  }

  /**
   * 把可能是单项或数组的数据统一成数组。
   *
   * 高德接口有些字段在单结果时可能返回对象，多结果时返回数组。
   */
  function toArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    return value ? [value] : [];
  }

  /**
   * 清理高德返回说明里的 HTML 标签。
   *
   * 高德步骤文案偶尔带有 <b> 等标签，React 面板只需要纯文本。
   */
  function stripHtml(value) {
    return typeof value === "string"
      ? value.replace(/<[^>]*>/g, "").trim()
      : "";
  }

  /**
   * 把字符串/数字统一转成有限数字。
   */
  function toFiniteNumber(value) {
    var number = Number(value);

    return Number.isFinite(number) ? number : undefined;
  }

  /**
   * 校验本地高德配置。
   */
  function validateConfig() {
    if (!hasText(AMAP_CONFIG.key) || !hasText(AMAP_CONFIG.securityJsCode)) {
      throw new Error("未配置高德地图 key 或 securityJsCode");
    }
  }

  /**
   * 合并 create() 的地图初始化参数。
   *
   * 外部传入值必须通过基础校验，否则回落到 AMAP_CONFIG 默认值。
   */
  function resolveMapOptions(options) {
    var safeOptions = options || {};

    return {
      center: isLngLat(safeOptions.center)
        ? safeOptions.center
        : AMAP_CONFIG.center,
      mapStyle:
        typeof safeOptions.mapStyle === "string" && safeOptions.mapStyle
          ? safeOptions.mapStyle
          : AMAP_CONFIG.mapStyle,
      zoom:
        typeof safeOptions.zoom === "number"
          ? safeOptions.zoom
          : AMAP_CONFIG.zoom,
    };
  }

  /**
   * 校验并约束 fitView padding。
   *
   * padding 顺序为 [top, right, bottom, left]；过小会贴边，过大可能让地图
   * 视野异常，所以限制在 24 到 720 像素。
   */
  function resolveFitViewPadding(value) {
    if (
      !Array.isArray(value) ||
      value.length !== 4 ||
      !value.every(isFiniteNumber)
    ) {
      return DEFAULT_FIT_VIEW_PADDING;
    }

    return value.map(function (item) {
      return Math.max(24, Math.min(Math.round(item), 720));
    });
  }

  /**
   * 创建点位 Marker 的 HTML 内容。
   *
   * 高德 Marker 使用这个 DOM 作为 content。click 在这里 stopPropagation，是为了
   * 点位点击只选择点位，不继续触发地图空白点击。
   */
  function createMarkerContent(marker, selected, onMarkerClick, markerNumber) {
    var markerKind = normalizeMarkerKind(marker && marker.kind);
    var markerColor = normalizeMarkerColor(marker && marker.color);
    var button = document.createElement("button");
    button.type = "button";
    button.className =
      "amap-html-marker" +
      " amap-html-marker-" +
      markerKind +
      (selected ? " amap-html-marker-selected" : "") +
      (marker.locked ? " amap-html-marker-locked" : " amap-html-marker-draggable");
    button.style.setProperty("--amap-marker-color", markerColor);
    button.setAttribute("aria-label", "选择标记点：" + marker.name);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      selectMarker(marker.id, onMarkerClick);
    });

    var pin = document.createElement("span");
    pin.className = "amap-html-marker-pin";

    var icon = document.createElement("span");
    icon.className = "amap-html-marker-icon";
    icon.setAttribute("aria-hidden", "true");

    if (markerKind === "circle-number") {
      icon.textContent = String(
        Math.max(1, Math.min(Math.round(markerNumber || 1), 99)),
      );
    }

    pin.appendChild(icon);
    button.append(pin);
    return button;
  }

  /**
   * 校正点位视觉样式，兼容外部传入旧数据或未知字符串的情况。
   */
  function normalizeMarkerKind(value) {
    return ["star", "circle", "circle-star", "circle-number"].indexOf(value) >= 0
      ? value
      : "circle";
  }

  /**
   * 校正点位颜色，只允许常见十六进制色值进入自定义 Marker DOM。
   */
  function normalizeMarkerColor(value) {
    if (!hasText(value)) {
      return "#2563eb";
    }

    var color = value.trim();

    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)
      ? color
      : "#2563eb";
  }

  /**
   * 创建用户定位点的 HTML 内容。
   */
  function createUserLocationContent() {
    var root = document.createElement("span");
    root.className = "amap-user-location";

    var pulse = document.createElement("span");
    pulse.className = "amap-user-location-pulse";

    var dot = document.createElement("span");
    dot.className = "amap-user-location-dot";

    root.append(pulse, dot);
    return root;
  }

  /**
   * 触发 React 层点位选择回调。
   */
  function selectMarker(markerId, onMarkerClick) {
    if (typeof onMarkerClick === "function") {
      onMarkerClick(markerId);
    }
  }

  /**
   * 判断值是否是应用层标准经纬度数组：[lng, lat]。
   */
  function isLngLat(value) {
    return (
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(function (item) {
        return typeof item === "number";
      })
    );
  }

  /**
   * 把高德 LngLat、普通对象或数组归一化为 [lng, lat]。
   *
   * 统一保留 6 位小数，既能减少 React 状态抖动，也足够满足旅游点位精度。
   */
  function toLngLatArray(value) {
    if (isLngLat(value)) {
      return [roundLngLat(value[0]), roundLngLat(value[1])];
    }

    if (
      value &&
      typeof value.getLng === "function" &&
      typeof value.getLat === "function"
    ) {
      return [roundLngLat(value.getLng()), roundLngLat(value.getLat())];
    }

    if (
      value &&
      typeof value.lng === "number" &&
      typeof value.lat === "number"
    ) {
      return [roundLngLat(value.lng), roundLngLat(value.lat)];
    }

    return null;
  }

  /**
   * 将高德 Pixel 或普通点对象转换成 [x, y]。
   */
  function toContainerPointArray(value) {
    if (Array.isArray(value) && value.length >= 2) {
      return [roundContainerPoint(value[0]), roundContainerPoint(value[1])];
    }

    if (
      value &&
      typeof value.getX === "function" &&
      typeof value.getY === "function"
    ) {
      return [
        roundContainerPoint(value.getX()),
        roundContainerPoint(value.getY()),
      ];
    }

    if (
      value &&
      typeof value.x === "number" &&
      typeof value.y === "number"
    ) {
      return [roundContainerPoint(value.x), roundContainerPoint(value.y)];
    }

    return null;
  }

  /**
   * 校验地图容器像素坐标。
   */
  function isContainerPoint(value) {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      isFiniteNumber(value[0]) &&
      isFiniteNumber(value[1])
    );
  }

  /**
   * 经纬度精度收敛。
   */
  function roundLngLat(value) {
    return Number(value.toFixed(6));
  }

  /**
   * 像素坐标精度收敛，避免白板重投影时产生无意义的小数抖动。
   */
  function roundContainerPoint(value) {
    return Number(value.toFixed(2));
  }

  /**
   * 判断字符串是否有有效内容。
   */
  function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  /**
   * 判断值是否为有限数字。
   */
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /**
   * 暴露给 React 的唯一桥接对象。
   *
   * React 组件不直接 import 本文件，而是在 MapLayer 加载 /map.js 后通过 window.map
   * 访问这些方法。新增地图能力时优先在这里补方法，再在 TypeScript 类型里同步声明。
   */
  window.map = {
    containerToLngLat: containerToLngLat,
    create: create,
    destroy: destroy,
    fitView: fitView,
    focusLngLat: focusLngLat,
    focusMarker: focusMarker,
    getAMap: function () {
      return AMapRuntime;
    },
    getCities: getCities,
    getCurrentCity: getCurrentCity,
    getInstance: function () {
      return mapInstance;
    },
    getViewport: getViewport,
    load: load,
    lngLatToContainer: lngLatToContainer,
    planRoute: planRoute,
    searchPlaces: searchPlaces,
    clearRoute: clearRoute,
    setCity: setCity,
    setInteractionHandlers: setInteractionHandlers,
    setMarkers: setMarkers,
    setRoute: setRoute,
    setRoutes: setRoutes,
    setUserLocation: setUserLocation,
    setViewport: setViewport,
  };
})();
