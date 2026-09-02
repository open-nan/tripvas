"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MapPin, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PlaceSuggestion } from "./map-editor-types";
import { formatPlaceAddress } from "./map-editor-utils";

/**
 * 点位搜索浮层的组件接口。
 *
 * 这个组件由点位详情通过工具栏 slot 展开，内部自己维护城市输入和搜索结果；
 * 选中结果后只把“绑定地点”的意图交回上层，具体点位如何更新由父组件决定。
 */
type SearchPanelProps = {
  /**
   * 用户点击某个高德地点搜索结果时触发。
   *
   * 回调参数已经是应用层统一的地点结构，父组件通常会用它更新当前点位的
   * 名称、地址和经纬度。
   */
  onApplyPlace: (place: PlaceSuggestion) => void;
};

type CityOption = NanMapCityOption;
type CityGroupMode = "initial" | "province";
type CityListStatus = "error" | "loading" | "ready";
type SearchStatus = "error" | "idle" | "loading" | "ready";
type CityGroup = {
  cities: CityOption[];
  indexLabel: string;
  key: string;
  title: string;
};
type CityPopoverPlacement = "bottom" | "top";
type CityPopoverStyle = CSSProperties & {
  "--city-popover-anchor-x"?: string;
  "--city-popover-max-height"?: string;
};

const CITY_POPOVER_GAP = 8;
const CITY_POPOVER_MAX_HEIGHT = 300;
const CITY_POPOVER_MIN_HEIGHT = 180;
const CITY_POPOVER_WIDTH = 292;
const CITY_LIST_WAIT_TIMEOUT = 30000;
const CURRENT_CITY_WAIT_TIMEOUT = 1500;
const MAP_BRIDGE_WAIT_TIMEOUT = 3000;
const PREVIEW_PLACE_ZOOM = 16;

const CITY_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CITY_GROUP_MODES: Array<{
  label: string;
  mode: CityGroupMode;
}> = [
  { label: "首字母", mode: "initial" },
  { label: "省区", mode: "province" },
];
const PROVINCE_ORDER = [
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "香港特别行政区",
  "澳门特别行政区",
  "台湾省",
];
const DEFAULT_CITY: CityOption = {
  adcode: "310000",
  center: [121.4737, 31.2304],
  citycode: "021",
  initial: "S",
  name: "上海市",
  province: "上海市",
  provinceAdcode: "310000",
};

export function SearchPanel({
  onApplyPlace,
}: SearchPanelProps) {
  const [activeCityGroupKey, setActiveCityGroupKey] = useState(
    DEFAULT_CITY.initial,
  );
  const [city, setCity] = useState(DEFAULT_CITY.name);
  const [cityGroupMode, setCityGroupMode] =
    useState<CityGroupMode>("initial");
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [cityListMessage, setCityListMessage] =
    useState("正在从高德加载城市列表");
  const [cityListStatus, setCityListStatus] =
    useState<CityListStatus>("loading");
  const [isCityOpen, setIsCityOpen] = useState(false);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [query, setQuery] = useState("");
  const [searchMessage, setSearchMessage] =
    useState("选择城市并输入地点关键词");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [cityPopoverPlacement, setCityPopoverPlacement] =
    useState<CityPopoverPlacement>("bottom");
  const [cityPopoverStyle, setCityPopoverStyle] =
    useState<CityPopoverStyle | null>(null);
  const cityPopoverRef = useRef<HTMLDivElement | null>(null);
  const cityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cityOptionsRef = useRef<HTMLDivElement | null>(null);
  const cityGroupRefs = useRef(new Map<string, HTMLDivElement>());
  const cityRef = useRef(DEFAULT_CITY.name);
  const cityGroupModeRef = useRef<CityGroupMode>("initial");
  const didAlignCityPopoverRef = useRef(false);
  const latestSearchIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);
  const userPickedCityRef = useRef(false);

  const cityGroups = useMemo(
    () => createCityGroups(cityOptions, cityGroupMode),
    [cityGroupMode, cityOptions],
  );

  const availableCityGroupKeys = useMemo(
    () =>
      new Set(
        cityGroups
          .filter((group) => group.cities.length > 0)
          .map((group) => group.key),
      ),
    [cityGroups],
  );

  const visibleCityGroups = useMemo(
    () => cityGroups.filter((group) => group.cities.length > 0),
    [cityGroups],
  );

  const selectedCity = useMemo(
    () =>
      findCityOptionByName(city, cityOptions) ?? createDetachedCityOption(city),
    [city, cityOptions],
  );

  const scrollToCityGroup = useCallback(
    (initial: string, behavior: ScrollBehavior = "auto") => {
      const groupNode = cityGroupRefs.current.get(initial);

      if (!groupNode) {
        return;
      }

      groupNode.scrollIntoView({
        behavior,
        block: "start",
      });
    },
    [],
  );

  const updateCityPopoverPosition = useCallback(() => {
    const trigger = cityTriggerRef.current;

    if (!trigger) {
      return;
    }

    const viewportPadding = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverWidth = Math.max(
      triggerRect.width,
      Math.min(CITY_POPOVER_WIDTH, window.innerWidth - viewportPadding * 2),
    );
    const popoverLeft = Math.min(
      Math.max(triggerRect.left, viewportPadding),
      window.innerWidth - popoverWidth - viewportPadding,
    );
    const availableBelow =
      window.innerHeight -
      triggerRect.bottom -
      CITY_POPOVER_GAP -
      viewportPadding;
    const availableAbove =
      triggerRect.top - CITY_POPOVER_GAP - viewportPadding;
    const shouldOpenAbove =
      availableBelow < CITY_POPOVER_MIN_HEIGHT &&
      availableAbove > availableBelow;
    const availableHeight = shouldOpenAbove ? availableAbove : availableBelow;
    const popoverHeight = Math.max(
      CITY_POPOVER_MIN_HEIGHT,
      Math.min(CITY_POPOVER_MAX_HEIGHT, availableHeight),
    );
    const popoverTop = shouldOpenAbove
      ? Math.max(viewportPadding, triggerRect.top - CITY_POPOVER_GAP - popoverHeight)
      : Math.min(
          triggerRect.bottom + CITY_POPOVER_GAP,
          window.innerHeight - viewportPadding - popoverHeight,
        );
    const anchorX = Math.min(
      Math.max(triggerRect.left + triggerRect.width / 2 - popoverLeft, 16),
      popoverWidth - 16,
    );

    setCityPopoverPlacement(shouldOpenAbove ? "top" : "bottom");
    setCityPopoverStyle({
      "--city-popover-anchor-x": `${anchorX}px`,
      "--city-popover-max-height": `${popoverHeight}px`,
      height: popoverHeight,
      left: popoverLeft,
      maxHeight: popoverHeight,
      top: popoverTop,
      width: popoverWidth,
    });
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  useEffect(() => {
    cityGroupModeRef.current = cityGroupMode;
  }, [cityGroupMode]);

  useEffect(() => {
    if (!isCityOpen) {
      didAlignCityPopoverRef.current = false;
      return;
    }

    updateCityPopoverPosition();

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        cityTriggerRef.current?.contains(target) ||
        cityPopoverRef.current?.contains(target)
      ) {
        return;
      }

      setIsCityOpen(false);
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCityOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", updateCityPopoverPosition);
    window.addEventListener("scroll", updateCityPopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", updateCityPopoverPosition);
      window.removeEventListener("scroll", updateCityPopoverPosition, true);
    };
  }, [isCityOpen, updateCityPopoverPosition]);

  useEffect(() => {
    if (
      !isCityOpen ||
      cityOptions.length === 0 ||
      didAlignCityPopoverRef.current
    ) {
      return;
    }

    didAlignCityPopoverRef.current = true;
    const frameId = window.requestAnimationFrame(() => {
      scrollToCityGroup(activeCityGroupKey);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    activeCityGroupKey,
    cityOptions.length,
    isCityOpen,
    scrollToCityGroup,
  ]);

  useEffect(() => {
    let ignore = false;

    async function syncCityOptions() {
      setCityListStatus("loading");
      setCityListMessage("正在从高德加载城市列表");

      try {
        const mapBridge = await waitForMapBridge();

        if (typeof mapBridge.getCities !== "function") {
          throw new Error("地图接口未暴露高德城市列表能力");
        }

        const cities = await withTimeout(
          mapBridge.getCities(),
          CITY_LIST_WAIT_TIMEOUT,
          "高德城市列表加载超时，请稍后重试",
        );

        if (ignore) {
          return;
        }

        const cityOptions = normalizeCityOptions(cities);

        if (cityOptions.length === 0) {
          throw new Error("高德没有返回城市列表");
        }

        const currentMode = cityGroupModeRef.current;
        const fallbackCityOption =
          findCityOptionByName(cityRef.current, cityOptions) ??
          cityOptions[0] ??
          DEFAULT_CITY;

        setCityOptions(cityOptions);
        setCityListStatus("ready");
        setCityListMessage(`已从高德加载 ${cityOptions.length} 个城市`);
        setActiveCityGroupKey((currentKey) =>
          hasCityGroupKey(cityOptions, currentMode, currentKey)
            ? currentKey
            : resolveCityGroupKey(fallbackCityOption, currentMode),
        );
        setSearchMessage(`已从高德加载 ${cityOptions.length} 个城市`);

        const currentCity = await readCurrentCity(mapBridge);

        if (ignore) {
          return;
        }

        const currentCityOption = findCityOptionByName(
          currentCity,
          cityOptions,
        );

        if (!userPickedCityRef.current && currentCityOption) {
          cityRef.current = currentCityOption.name;
          setCity(currentCityOption.name);
          setActiveCityGroupKey(
            resolveCityGroupKey(
              currentCityOption,
              cityGroupModeRef.current,
            ),
          );
          setSearchMessage(`当前城市已定位到 ${currentCityOption.name}`);
        }
      } catch (error) {
        if (ignore) {
          return;
        }

        const message = getCityListErrorMessage(error);

        setCityOptions([]);
        setCityListStatus("error");
        setCityListMessage(message);
        setSearchMessage(message);
      }
    }

    void syncCityOptions();

    return () => {
      ignore = true;
    };
  }, []);

  function handleCitySelect(option: CityOption) {
    userPickedCityRef.current = true;
    cityRef.current = option.name;
    setCity(option.name);
    setActiveCityGroupKey(resolveCityGroupKey(option, cityGroupMode));
    setIsCityOpen(false);
    setSearchMessage(`已切换到 ${option.name}`);
    void jumpToCity(option.name);

    if (query.trim()) {
      searchPlaces(option.name, query);
    }
  }

  function handleQueryChange(keyword: string) {
    setQuery(keyword);
    searchPlaces(city, keyword);
  }

  function handleCityGroupModeChange(nextMode: CityGroupMode) {
    if (cityGroupMode === nextMode) {
      return;
    }

    const selectedOption =
      findCityOptionByName(cityRef.current, cityOptions) ?? cityOptions[0];
    const nextGroupKey = selectedOption
      ? resolveCityGroupKey(selectedOption, nextMode)
      : nextMode === "initial"
        ? DEFAULT_CITY.initial
        : resolveProvinceGroupKey(DEFAULT_CITY);

    didAlignCityPopoverRef.current = false;
    cityGroupModeRef.current = nextMode;
    setCityGroupMode(nextMode);
    setActiveCityGroupKey(nextGroupKey);
  }

  function handleCityGroupSelect(groupKey: string) {
    if (!availableCityGroupKeys.has(groupKey)) {
      return;
    }

    setActiveCityGroupKey(groupKey);
    scrollToCityGroup(groupKey, "smooth");
  }

  function handleCityOptionsScroll() {
    const container = cityOptionsRef.current;

    if (!container) {
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const nextGroup = visibleCityGroups.reduce<string | null>(
      (currentGroupKey, group) => {
        const groupNode = cityGroupRefs.current.get(group.key);

        if (!groupNode) {
          return currentGroupKey;
        }

        return groupNode.getBoundingClientRect().top - containerTop <= 12
          ? group.key
          : currentGroupKey;
      },
      null,
    );

    if (nextGroup && nextGroup !== activeCityGroupKey) {
      setActiveCityGroupKey(nextGroup);
    }
  }

  function bindCityGroupRef(groupKey: string) {
    return (node: HTMLDivElement | null) => {
      if (node) {
        cityGroupRefs.current.set(groupKey, node);
        return;
      }

      cityGroupRefs.current.delete(groupKey);
    };
  }

  function searchPlaces(searchCity: string, keyword: string) {
    const trimmedKeyword = keyword.trim();
    const searchPlacesApi = window.map?.searchPlaces;

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    if (!trimmedKeyword) {
      latestSearchIdRef.current += 1;
      setPlaces([]);
      setSearchStatus("idle");
      setSearchMessage("输入地点关键词开始搜索");
      return;
    }

    if (typeof searchPlacesApi !== "function") {
      latestSearchIdRef.current += 1;
      setPlaces([]);
      setSearchStatus("error");
      setSearchMessage("地图搜索接口还没有加载完成");
      return;
    }

    const searchId = latestSearchIdRef.current + 1;
    latestSearchIdRef.current = searchId;
    setSearchStatus("loading");
    setSearchMessage(`正在 ${searchCity} 搜索地点`);

    searchTimeoutRef.current = window.setTimeout(() => {
      searchPlacesApi({
        city: searchCity,
        keyword: trimmedKeyword,
        pageSize: 8,
      })
        .then((result) => {
          if (latestSearchIdRef.current !== searchId) {
            return;
          }

          setPlaces(result.places);
          setSearchStatus("ready");
          setSearchMessage(result.message);
        })
        .catch((error: unknown) => {
          if (latestSearchIdRef.current !== searchId) {
            return;
          }

          setPlaces([]);
          setSearchStatus("error");
          setSearchMessage(getSearchErrorMessage(error));
        });
    }, 220);
  }

  function handlePreviewPlace(place: PlaceSuggestion) {
    window.map?.focusLngLat?.(place.lngLat, {
      zoom: PREVIEW_PLACE_ZOOM,
    });
  }

  return (
    <Card className="marker-search-panel border-border/90 bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
      <CardHeader className="gap-2 p-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <Badge className="gap-1.5" variant="secondary">
            <Search className="size-3" />
            地点搜索
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="marker-search-panel-content px-3 pb-3 pt-0">
        <div className="marker-search-controls grid grid-cols-[92px_1fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="marker-search-city">城市</Label>
            <div className="city-select">
              <Button
                aria-expanded={isCityOpen}
                aria-haspopup="dialog"
                aria-controls={
                  isCityOpen ? "marker-search-city-popover" : undefined
                }
                className="city-select-trigger"
                id="marker-search-city"
                onClick={() => setIsCityOpen((open) => !open)}
                ref={cityTriggerRef}
                type="button"
                variant="outline"
              >
                <MapPin className="size-3.5" />
                <span>{selectedCity.name}</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="marker-search-query">地点</Label>
            <Input
              autoFocus
              id="marker-search-query"
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="输入地点名称"
              value={query}
            />
          </div>
        </div>

        {searchMessage && (
          <p
            className={cn(
              "marker-search-message text-xs leading-5 text-muted-foreground",
              searchStatus === "error" && "text-destructive",
            )}
          >
            {searchMessage}
          </p>
        )}

        {places.length > 0 && (
          <div className="marker-search-results space-y-2">
            {places.map((place) => (
              <Button
                className="marker-search-result h-auto w-full justify-start px-3 py-2 text-left"
                key={place.id}
                onFocus={() => handlePreviewPlace(place)}
                onMouseEnter={() => handlePreviewPlace(place)}
                onClick={() => onApplyPlace(place)}
                variant="ghost"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {place.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatPlaceAddress(place)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </CardContent>

      {isCityOpen &&
        cityPopoverStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "city-select-popover",
              cityGroupMode === "province" && "city-select-popover-province",
              cityOptions.length === 0 && "city-select-popover-empty",
              cityPopoverPlacement === "top"
                ? "city-select-popover-top"
                : "city-select-popover-bottom",
            )}
            aria-label="城市选择"
            id="marker-search-city-popover"
            ref={cityPopoverRef}
            role="dialog"
            style={cityPopoverStyle}
          >
            {cityOptions.length > 0 ? (
              <>
                <div className="city-select-mode-bar" aria-label="城市排列方式">
                  {CITY_GROUP_MODES.map((item) => (
                    <button
                      aria-pressed={cityGroupMode === item.mode}
                      className={cn(
                        "city-select-mode-button",
                        cityGroupMode === item.mode &&
                          "city-select-mode-button-active",
                      )}
                      key={item.mode}
                      onClick={() => handleCityGroupModeChange(item.mode)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div
                  className="city-select-index"
                  aria-label={
                    cityGroupMode === "initial" ? "城市首字母" : "城市省区"
                  }
                >
                  {cityGroups.map((group) => {
                    const hasCities = availableCityGroupKeys.has(group.key);

                    return (
                      <button
                        aria-pressed={activeCityGroupKey === group.key}
                        className={cn(
                          "city-select-index-button",
                          cityGroupMode === "province" &&
                            "city-select-index-button-province",
                          activeCityGroupKey === group.key &&
                            "city-select-index-button-active",
                        )}
                        disabled={!hasCities}
                        key={group.key}
                        onClick={() => handleCityGroupSelect(group.key)}
                        title={group.title}
                        type="button"
                      >
                        {group.indexLabel}
                      </button>
                    );
                  })}
                </div>

                <div
                  className="city-select-options"
                  onScroll={handleCityOptionsScroll}
                  ref={cityOptionsRef}
                  role="listbox"
                >
                  {visibleCityGroups.map((group) => (
                    <div
                      className="city-select-group"
                      key={group.key}
                      ref={bindCityGroupRef(group.key)}
                    >
                      <div className="city-select-group-title">
                        {group.title}
                      </div>
                      <div className="city-select-group-grid">
                        {group.cities.map((option) => (
                          <button
                            aria-selected={option.name === city}
                            className={cn(
                              "city-select-option",
                              option.name === city &&
                                "city-select-option-active",
                            )}
                            key={option.adcode ?? option.name}
                            onClick={() => handleCitySelect(option)}
                            role="option"
                            type="button"
                          >
                            {option.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                className={cn(
                  "city-select-empty",
                  cityListStatus === "error" && "text-destructive",
                )}
              >
                {cityListMessage}
              </div>
            )}
          </div>,
          document.body,
        )}
    </Card>
  );
}

async function jumpToCity(city: string) {
  const mapBridge = window.map;

  if (!mapBridge || typeof mapBridge.setCity !== "function") {
    return;
  }

  try {
    const currentCity = await mapBridge.getCurrentCity?.();

    if (isSameCityName(currentCity, city)) {
      return;
    }

    await mapBridge.setCity(city);
  } catch {
    // 城市跳转失败不影响地点搜索，保持搜索面板可继续使用。
  }
}

async function readCurrentCity(mapBridge: NanMapBridge) {
  if (typeof mapBridge.getCurrentCity !== "function") {
    return undefined;
  }

  try {
    return await withTimeout(
      mapBridge.getCurrentCity(),
      CURRENT_CITY_WAIT_TIMEOUT,
      "当前城市获取超时",
    );
  } catch {
    return undefined;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      rejectOnce(new Error(timeoutMessage));
    }, timeoutMs);

    function cleanup() {
      if (settled) {
        return false;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      return true;
    }

    function resolveOnce(value: T) {
      if (cleanup()) {
        resolve(value);
      }
    }

    function rejectOnce(error: unknown) {
      if (cleanup()) {
        reject(error);
      }
    }

    promise.then(resolveOnce, rejectOnce);
  });
}

function isSameCityName(currentCity: string | undefined, nextCity: string) {
  return normalizeCityName(currentCity) === normalizeCityName(nextCity);
}

function findCityOptionByName(
  city: string | undefined,
  cityOptions: CityOption[],
) {
  const normalizedCity = normalizeCityName(city);

  return cityOptions.find(
    (option) => normalizeCityName(option.name) === normalizedCity,
  );
}

function normalizeCityOptions(cityOptions: CityOption[]) {
  const seenCities = new Set<string>();

  return cityOptions
    .map(normalizeCityOption)
    .filter((option): option is CityOption => Boolean(option))
    .filter((option) => {
      const cityKey = normalizeCityName(option.name) || option.adcode || option.name;

      if (seenCities.has(cityKey)) {
        return false;
      }

      seenCities.add(cityKey);
      return true;
    })
    .sort((left, right) =>
      left.initial === right.initial
        ? left.name.localeCompare(right.name, "zh-Hans-CN-u-co-pinyin")
        : left.initial.localeCompare(right.initial),
    );
}

function createCityGroups(
  cityOptions: CityOption[],
  mode: CityGroupMode,
): CityGroup[] {
  return mode === "province"
    ? createProvinceCityGroups(cityOptions)
    : createInitialCityGroups(cityOptions);
}

function createInitialCityGroups(cityOptions: CityOption[]): CityGroup[] {
  return CITY_INITIALS.map((initial) => ({
    cities: cityOptions.filter((option) => option.initial === initial),
    indexLabel: initial,
    key: initial,
    title: initial,
  }));
}

function createProvinceCityGroups(cityOptions: CityOption[]): CityGroup[] {
  const groupsByKey = new Map<string, CityGroup>();

  cityOptions.forEach((option) => {
    const key = resolveProvinceGroupKey(option);
    const title = resolveProvinceGroupTitle(option);
    const existingGroup = groupsByKey.get(key);
    const cities = sortCityOptionsByName([
      ...(existingGroup?.cities ?? []),
      option,
    ]);

    groupsByKey.set(key, {
      cities,
      indexLabel: existingGroup?.indexLabel ?? formatProvinceIndexLabel(title),
      key,
      title: existingGroup?.title ?? title,
    });
  });

  return Array.from(groupsByKey.values()).sort(compareProvinceGroups);
}

function hasCityGroupKey(
  cityOptions: CityOption[],
  mode: CityGroupMode,
  groupKey: string,
) {
  return cityOptions.some(
    (option) => resolveCityGroupKey(option, mode) === groupKey,
  );
}

function resolveCityGroupKey(city: CityOption, mode: CityGroupMode) {
  return mode === "province"
    ? resolveProvinceGroupKey(city)
    : normalizeCityInitial(city.initial);
}

function resolveProvinceGroupKey(city: CityOption) {
  const provinceAdcode = city.provinceAdcode?.trim();

  if (provinceAdcode) {
    return provinceAdcode;
  }

  const provinceName = normalizeProvinceName(city.province);

  return provinceName || "unknown-province";
}

function resolveProvinceGroupTitle(city: CityOption) {
  return city.province?.trim() || "其他省区";
}

function formatProvinceIndexLabel(province: string) {
  const provinceName = normalizeProvinceName(province);

  if (!provinceName) {
    return "其他";
  }

  return provinceName.length > 3 ? provinceName.slice(0, 3) : provinceName;
}

function sortCityOptionsByName(cityOptions: CityOption[]) {
  return [...cityOptions].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-Hans-CN-u-co-pinyin"),
  );
}

function compareProvinceGroups(left: CityGroup, right: CityGroup) {
  const leftIndex = getProvinceOrderIndex(left.title);
  const rightIndex = getProvinceOrderIndex(right.title);

  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return left.title.localeCompare(right.title, "zh-Hans-CN-u-co-pinyin");
}

function getProvinceOrderIndex(province: string) {
  const provinceName = normalizeProvinceName(province);
  const index = PROVINCE_ORDER.findIndex(
    (orderedProvince) => normalizeProvinceName(orderedProvince) === provinceName,
  );

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function normalizeCityOption(option: CityOption) {
  const name = option.name.trim();

  if (!name) {
    return null;
  }

  return {
    ...option,
    initial: normalizeCityInitial(option.initial),
    name,
  };
}

function normalizeCityInitial(initial: string | undefined) {
  const firstChar = initial?.trim().charAt(0).toUpperCase();

  return firstChar && /^[A-Z]$/.test(firstChar) ? firstChar : "Z";
}

function createDetachedCityOption(city: string | undefined): CityOption {
  const name = city?.trim() || DEFAULT_CITY.name;

  return {
    ...DEFAULT_CITY,
    initial: DEFAULT_CITY.initial,
    name,
  };
}

function normalizeCityName(city: string | undefined) {
  return city?.replace(/\s/g, "").replace(/市$/, "") ?? "";
}

function normalizeProvinceName(province: string | undefined) {
  return (
    province
      ?.replace(/\s/g, "")
      .replace(
        /(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/,
        "",
      ) ?? ""
  );
}

function waitForMapBridge() {
  if (window.map) {
    return Promise.resolve(window.map);
  }

  return new Promise<NanMapBridge>((resolve, reject) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (window.map) {
        window.clearInterval(intervalId);
        resolve(window.map);
        return;
      }

      if (Date.now() - startedAt > MAP_BRIDGE_WAIT_TIMEOUT) {
        window.clearInterval(intervalId);
        reject(new Error("public/map.js 还没有加载完成"));
      }
    }, 50);
  });
}

function getCityListErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "高德城市列表加载失败，请稍后重试";
}

function getSearchErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "高德地点搜索失败，请稍后重试";
}
