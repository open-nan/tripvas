declare global {
  /**
   * 地图点位在业务里的视觉样式。
   *
   * 这些值会传给 public/map.js，用来决定高德 Marker 的图形：
   * star 表示五角星，circle 表示圆底，circle-star 表示圆底镂空星，
   * circle-number 表示圆底镂空数字。
   */
  type NanMapMarkerKind = "star" | "circle" | "circle-star" | "circle-number";

  /**
   * 高德地图使用的经纬度坐标。
   *
   * 顺序必须是 [经度, 纬度]，也就是 [lng, lat]。不要和浏览器定位 API
   * 返回的 latitude/longitude 字段顺序混用。
   */
  type NanMapLngLat = [longitude: number, latitude: number];

  /**
   * 地图容器内的屏幕像素坐标。
   *
   * 顺序为 [x, y]，原点是高德地图容器左上角。白板层会用它在 Konva 画布
   * 和高德地图经纬度之间做坐标投影。
   */
  type NanMapContainerPoint = [x: number, y: number];

  /**
   * 地图自适应视野时的内边距。
   *
   * 顺序与高德 setFitView padding 保持一致：[上, 右, 下, 左]，单位是像素。
   * 左右面板展开时通过它给地图关键点位留出可见区域。
   */
  type NanMapViewportPadding = [
    top: number,
    right: number,
    bottom: number,
    left: number,
  ];

  /**
   * 当前地图视野快照。
   *
   * 用于导入导出模块保存和恢复地图中心与缩放，不包含点位、路线或白板对象。
   */
  type NanMapViewportSnapshot = {
    /** 当前地图中心点。 */
    center: NanMapLngLat;
    /** 当前地图缩放级别。 */
    zoom: number;
  };

  /**
   * React 传给地图桥接层的点位数据。
   *
   * public/map.js 会把这些数据转换成高德 Marker 覆盖物，并把拖动/点击事件
   * 再回传给 React。
   */
  type NanMapLayerMarker = {
    /** 点位的稳定唯一标识，用于选中、拖动回写和路线端点匹配。 */
    id: string;
    /** 点位的视觉样式。 */
    kind: NanMapMarkerKind;
    /** 点位颜色，支持十六进制颜色；缺省时地图层使用默认蓝色。 */
    color?: string;
    /** 点位在地图上的中心坐标。 */
    lngLat: NanMapLngLat;
    /** 是否锁定点位；锁定后地图标记不可拖动。 */
    locked?: boolean;
    /** 点位显示名称，会同步到高德 Marker 的 title。 */
    name: string;
  };

  /**
   * 路线规划交通方式。
   *
   * 与 public/map.js 内部调用的高德路线插件对应：
   * drive 驾车，transit 公交/地铁，ride 骑行，walk 步行。
   */
  type NanMapRoutePlanMode = "drive" | "transit" | "ride" | "walk";

  /**
   * 路线规划中的单个步骤。
   *
   * 详情面板用它展示高德返回的分段指引，例如步行、上车、转乘、道路行驶等。
   */
  type NanMapRoutePlanStep = {
    /** 当前步骤距离，单位米；高德未返回时可能为空。 */
    distance?: number;
    /** 当前步骤耗时，单位秒；高德未返回时可能为空。 */
    duration?: number;
    /** 当前步骤的人类可读指引文案。 */
    instruction: string;
  };

  /**
   * 地点搜索返回的单条地点结果。
   *
   * 这是桥接层把高德 PlaceSearch POI 规范化后的结构，React 不需要直接消费
   * 高德原始 POI 字段。
   */
  type NanMapPlaceSearchResult = {
    /** 地点地址，可能是高德返回的 address、district 等字段组合。 */
    address: string;
    /** 地点所在城市；高德缺省时可能为空。 */
    city?: string;
    /** 地点所在区县；高德缺省时可能为空。 */
    district?: string;
    /** 地点唯一标识，优先使用高德 POI id。 */
    id: string;
    /** 地点中心坐标。 */
    lngLat: NanMapLngLat;
    /** 地点名称。 */
    name: string;
    /** 高德地点类型描述，例如餐饮、公司、交通设施等。 */
    type?: string;
  };

  /**
   * 高德行政区服务返回的城市选项。
   *
   * public/map.js 会通过 AMap.DistrictSearch 获取全国行政区树，再把可用于
   * 地点搜索城市范围的节点整理成该结构。
   */
  type NanMapCityOption = {
    /** 高德行政区编码，可作为城市列表去重和后续扩展查询的稳定键。 */
    adcode?: string;
    /** 城市中心点坐标；高德行政区服务缺省时可能为空。 */
    center?: NanMapLngLat;
    /** 高德城市编码；部分直辖市或特别行政区可能为空。 */
    citycode?: string;
    /** 城市首字母，用于搜索面板左侧 A-Z 索引。 */
    initial: string;
    /** 城市名称，例如“上海市”。 */
    name: string;
    /** 城市所属省、自治区、直辖市或特别行政区。 */
    province?: string;
    /** 城市所属省级行政区编码。 */
    provinceAdcode?: string;
  };

  /**
   * 地点搜索响应。
   *
   * public/map.js 会统一返回这个结构，便于 React 直接渲染搜索状态和结果列表。
   */
  type NanMapPlaceSearchResponse = {
    /** 本次搜索使用的城市范围。 */
    city: string;
    /** 本次搜索使用的关键词。 */
    keyword: string;
    /** 给 UI 展示的搜索结果提示或错误兜底文案。 */
    message: string;
    /** 规范化后的地点结果列表。 */
    places: NanMapPlaceSearchResult[];
    /** 数据来源标识，当前固定为高德地图。 */
    source: "amap";
  };

  /**
   * 单条路线规划方案。
   *
   * 一次路线规划可能返回多个备选方案；每个方案包含总览指标、完整路径和分段步骤。
   */
  type NanMapRoutePlanOption = {
    /** 方案短标签，用于列表里快速区分方案。 */
    badge: string;
    /** 费用数值，单位元；步行/骑行通常为 0 或空。 */
    cost?: number;
    /** 费用展示标签，例如“费用”或“票价”。 */
    costLabel?: string;
    /** 方案总距离，单位米。 */
    distance: number;
    /** 方案总耗时，单位秒。 */
    duration: number;
    /** 方案唯一标识，用于选中和渲染详情。 */
    id: string;
    /** 方案完整路径坐标序列。地图绘制优先交给高德，React 可用于总览或备选展示。 */
    path: NanMapLngLat[];
    /** 方案分段指引。 */
    steps: NanMapRoutePlanStep[];
    /** 方案标题，例如“推荐路线”或高德返回的公交组合描述。 */
    title: string;
    /** 方案警告信息，例如限行、步行较长或高德返回的提示。 */
    warning?: string;
  };

  /**
   * 路线规划响应。
   *
   * 桥接层会调用对应交通方式的高德路线服务，并把结果整理为该结构。
   */
  type NanMapRoutePlanResult = {
    /** 给 UI 展示的规划状态说明。 */
    message: string;
    /** 本次规划使用的交通方式。 */
    mode: NanMapRoutePlanMode;
    /** 当前主方案的路径坐标序列。 */
    path: NanMapLngLat[];
    /** 可选路线方案列表，第一项通常是当前主方案。 */
    plans: NanMapRoutePlanOption[];
    /** 数据来源标识，当前固定为高德地图。 */
    source: "amap";
  };

  /**
   * React 传给地图桥接层的单条路线覆盖物。
   *
   * 与路线规划结果不同，这里只包含地图绘制所需信息：稳定 id、交通方式、路线 path
   * 和当前是否选中。桥接层会用这些数据批量重绘所有已保存线路。
   */
  type NanMapRouteOverlay = {
    /** 路线覆盖物稳定 id；点击地图线路时会原样回传给 React。 */
    id: string;
    /** 当前路线交通方式，用于决定线条颜色、虚线和方向箭头。 */
    mode?: NanMapRoutePlanMode;
    /** 自定义线路颜色；为空时桥接层按交通方式使用默认颜色。 */
    color?: string;
    /** 高德规划返回的路线坐标序列；少于两个点时不会绘制。 */
    path: NanMapLngLat[];
    /** 是否以选中编辑态绘制。 */
    selected?: boolean;
  };

  /**
   * 创建地图实例时的初始化选项。
   *
   * React 的 MapLayer 在 DOM 容器就绪后传入这些值，public/map.js 再创建高德地图实例。
   */
  type NanMapCreateOptions = {
    /** 初始地图中心点。 */
    center?: NanMapLngLat;
    /** 高德地图样式地址，例如 amap://styles/normal。 */
    mapStyle?: string;
    /** 初始缩放级别。 */
    zoom?: number;
  };

  /**
   * 重建地图点位时的附加选项。
   *
   * setMarkers 每次会按 React 当前状态重建高德 Marker，因此事件处理器也在这里同步注入。
   */
  type NanMapSetMarkersOptions = {
    /** 点击点位后的回调，只负责选中点位，不负责改变坐标。 */
    onMarkerClick?: (markerId: string) => void;
    /** 拖动点位结束后的回调，用于把最终坐标回写到 React 状态。 */
    onMarkerDragEnd?: (markerId: string, lngLat: NanMapLngLat) => void;
    /** 当前选中的点位 id，用于桥接层渲染选中态。 */
    selectedMarkerId?: string;
  };

  /**
   * 地图通用交互事件。
   *
   * 这些回调由 React 注入，桥接层只负责把高德事件转换成应用需要的事件。
   */
  type NanMapInteractionHandlers = {
    /** 地图空白区域点击回调；当前业务不通过点击改变点位位置。 */
    onMapClick?: (lngLat: NanMapLngLat) => void;
    /** 路线覆盖物点击回调，用于打开或聚焦指定线路详情。 */
    onRouteClick?: (routeId?: string) => void;
    /** 地图平移或缩放后的回调，用于让白板层重新投影经纬度坐标。 */
    onViewportChange?: () => void;
  };

  /**
   * 地图视野适配选项。
   *
   * 主要用于把点位、定位点和路线尽量收进可视区域，并避开右侧/底部面板遮挡。
   */
  type NanMapFitViewOptions = {
    /** 视野边距，顺序为 [上, 右, 下, 左]。 */
    padding?: NanMapViewportPadding;
    /** 指定路线 id 时，只围绕这条线路适配视野；找不到时回退到全量覆盖物。 */
    routeId?: string | null;
  };

  /**
   * 手动重绘某条已规划路线时的附加选项。
   *
   * 选项里的路线 path 必须来自高德路线规划结果；桥接层只负责把当前选中的候选路线
   * 重新画出来，不会用起终点直线兜底。
   */
  type NanMapSetRouteOptions = {
    /** 是否在绘制后自动适配视野；默认会适配。 */
    fitView?: boolean;
    /** 当前路线交通方式，用于决定地图线条样式。 */
    mode?: NanMapRoutePlanMode;
    /** 自定义线路颜色；为空时桥接层按交通方式使用默认颜色。 */
    color?: string;
    /** 视野边距，顺序为 [上, 右, 下, 左]。 */
    padding?: NanMapViewportPadding;
    /** 是否用选中态绘制路线；选中态会加粗路线并叠加点击友好的高亮层。 */
    selected?: boolean;
  };

  /**
   * 批量重绘路线覆盖物时的附加选项。
   */
  type NanMapSetRoutesOptions = {
    /** 是否在绘制后自动适配视野；默认不自动适配，由 React MapLayer 统一控制。 */
    fitView?: boolean;
    /** 视野边距，顺序为 [上, 右, 下, 左]。 */
    padding?: NanMapViewportPadding;
    /** 指定选中的路线 id；也可以直接在单条 NanMapRouteOverlay 上设置 selected。 */
    selectedRouteId?: string | null;
  };

  /**
   * 聚焦某个经纬度时的附加选项。
   */
  type NanMapFocusLngLatOptions = {
    /** 聚焦后的目标缩放级别；不传则只平移地图中心。 */
    zoom?: number;
  };

  /**
   * 发起路线规划的参数。
   *
   * points 至少需要两个坐标。不同交通方式会在桥接层里映射到不同的高德路线插件。
   */
  type NanMapPlanRouteOptions = {
    /** 城市范围，主要用于公交/地铁规划。 */
    city?: string;
    /** 交通方式。 */
    mode: NanMapRoutePlanMode;
    /** 路线端点坐标，顺序为起点、途经点、终点。 */
    points: NanMapLngLat[];
  };

  /**
   * 发起地点搜索的参数。
   *
   * 桥接层会调用高德 PlaceSearch，并把 POI 结果规范化成 NanMapPlaceSearchResponse。
   */
  type NanMapSearchPlacesOptions = {
    /** 城市范围；为空时桥接层可按业务策略使用全国或默认城市。 */
    city?: string;
    /** 地点关键词。 */
    keyword: string;
    /** 返回结果数量上限。 */
    pageSize?: number;
  };

  /**
   * 设置用户定位点时的附加选项。
   */
  type NanMapUserLocationOptions = {
    /** 定位精度半径，单位米；用于绘制高德 Circle 精度圈。 */
    accuracy?: number;
  };

  /**
   * public/map.js 暴露给 React 的地图桥接对象。
   *
   * React 侧统一通过 window.map 使用地图能力，不直接依赖高德 AMap 实例。
   * 这样可以把 key、安全密钥、插件加载、路线规划和地点搜索都隔离在 public/map.js 内。
   */
  type NanMapBridge = {
    /** 清空当前由高德路线服务绘制的路线覆盖物。 */
    clearRoute?: () => void;
    /** 将地图容器像素坐标转换成高德经纬度。 */
    containerToLngLat?: (
      point: NanMapContainerPoint,
    ) => NanMapLngLat | null;
    /**
     * 创建高德地图实例。
     *
     * container 是 React 渲染出来的地图容器 DOM；重复创建前桥接层会清理旧实例。
     */
    create: (
      container: HTMLElement,
      options?: NanMapCreateOptions,
    ) => Promise<unknown>;
    /** 销毁地图实例；传入 targetInstance 时只销毁指定实例。 */
    destroy: (targetInstance?: unknown) => void;
    /** 按当前覆盖物自动适配地图视野。 */
    fitView: (options?: NanMapFitViewOptions) => void;
    /** 平移或缩放到指定经纬度；用于搜索结果悬停预览，不改变业务点位坐标。 */
    focusLngLat?: (
      lngLat: NanMapLngLat,
      options?: NanMapFocusLngLatOptions,
    ) => void;
    /** 聚焦指定点位，通常用于点位列表或详情面板联动地图。 */
    focusMarker?: (markerId: string) => void;
    /** 获取高德 AMap 命名空间；仅用于少量调试或扩展场景。 */
    getAMap?: () => unknown;
    /** 通过高德行政区服务获取全国城市列表。 */
    getCities?: () => Promise<NanMapCityOption[]>;
    /** 获取地图当前所在城市，用于初始化搜索城市。 */
    getCurrentCity?: () => Promise<string>;
    /** 获取当前高德地图实例；仅用于桥接层外部确有必要的扩展场景。 */
    getInstance?: () => unknown;
    /** 获取当前地图中心和缩放级别，用于导出模板。 */
    getViewport?: () => NanMapViewportSnapshot | null;
    /** 加载并缓存高德 JSAPI 运行时。 */
    load: () => Promise<unknown>;
    /** 将高德经纬度转换成地图容器像素坐标。 */
    lngLatToContainer?: (
      lngLat: NanMapLngLat,
    ) => NanMapContainerPoint | null;
    /** 使用高德路线服务规划路线，并返回规范化后的方案数据。 */
    planRoute?: (
      options: NanMapPlanRouteOptions,
    ) => Promise<NanMapRoutePlanResult>;
    /** 使用高德地点搜索服务搜索 POI，并返回规范化后的地点列表。 */
    searchPlaces?: (
      options: NanMapSearchPlacesOptions,
    ) => Promise<NanMapPlaceSearchResponse>;
    /** 按城市名切换地图中心；当前城市相同时桥接层会跳过重复跳转。 */
    setCity?: (city: string) => Promise<string>;
    /** 注入地图点击、路线点击等交互回调；不传参数时清空回调。 */
    setInteractionHandlers?: (handlers?: NanMapInteractionHandlers) => void;
    /** 按 React 当前点位状态重建高德 Marker 覆盖物。 */
    setMarkers: (
      markers: NanMapLayerMarker[],
      options?: NanMapSetMarkersOptions,
    ) => void;
    /** 用高德 Polyline 绘制某条高德规划返回的候选路线 path。 */
    setRoute: (path: NanMapLngLat[], options?: NanMapSetRouteOptions) => void;
    /** 批量绘制所有已保存线路，点击线路时会回传对应 route id。 */
    setRoutes?: (
      routes: NanMapRouteOverlay[],
      options?: NanMapSetRoutesOptions,
    ) => void;
    /** 设置或清空用户定位点和精度圈。 */
    setUserLocation?: (
      lngLat?: NanMapLngLat | null,
      options?: NanMapUserLocationOptions,
    ) => void;
    /** 按导入模板恢复地图中心和缩放级别。 */
    setViewport?: (viewport: NanMapViewportSnapshot) => void;
  };

  /**
   * 浏览器全局对象扩展。
   *
   * public/map.js 加载完成后会把地图桥接对象挂到 window.map，
   * React 组件可以在客户端安全地通过 window.map 调用地图能力。
   */
  interface Window {
    /** Nan Map 的地图桥接对象，由 public/map.js 在浏览器运行时注入。 */
    map?: NanMapBridge;
  }
}

export {};
