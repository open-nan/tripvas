"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeDollarSign,
  CircleAlert,
  Clock,
  Milestone,
  Route,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { transportTabs } from "./map-editor-data";
import type {
  MapRoutePlanOption,
  MapRoutePlanResult,
  Marker,
  PointRouteEndpoints,
  RouteConnectionSummary,
  RoutePlanMetric,
  RoutePlanningStatus,
  ToolPanelActionSlotChange,
  TransportMode,
  UserLocation,
} from "./map-editor-types";
import {
  formatDistanceMeters,
  formatDurationSeconds,
  formatRouteCost,
  getDistanceMeters,
} from "./map-editor-utils";

const routeColorOptions = [
  { label: "蓝色", value: "#2563eb" },
  { label: "青绿", value: "#0f766e" },
  { label: "紫色", value: "#7c3aed" },
  { label: "橙色", value: "#f97316" },
  { label: "红色", value: "#dc2626" },
  { label: "红色", value: "#dc2625" },
  { label: "红色", value: "#dc2624" },
  { label: "红色", value: "#dc2623" },
];

/**
 * 路线规划详情面板的组件接口。
 *
 * RouteDetail 负责展示当前点到点路线或定位路线，并在线路弹框内提供交通方式切换。
 * 路线数据本身由 MapEditor 调用高德桥接层后传入。
 */
type RouteDetailProps = {
  /** 当前正在查看或编辑的点到点线路 id；定位路线或空态时为空。 */
  activePointRouteId: string | null;
  /** 定位路线的目标点位；只有从当前位置规划到点位时才有值。 */
  locationRouteTarget: Marker | null;
  /** 当前选中的点位；没有有效路线时会作为空态上下文展示。 */
  marker: Marker;
  /**
   * 替换工具面板按钮组的扩展按钮。
   *
   * RouteDetail 会注册已保存线路弹出选择器和删除按钮；卸载时清空，避免影响其他面板。
   */
  onActionSlotChange: ToolPanelActionSlotChange;
  /** 删除当前路线；用于路线选中编辑态下清空连接和地图路线覆盖物。 */
  onDeleteRoute: () => void;
  /** 选择指定点位，通常用于点击路线端点后回到对应点位详情。 */
  onSelectMarker: (id: string) => void;
  /** 选择某条已保存点到点线路，并切换到该线路的编辑状态。 */
  onSelectPointRoute: (routeId: string) => void;
  /** 选择指定路线方案，用于同步更新地图上绘制的线路。 */
  onSelectRoutePlan: (planId: string) => void;
  /** 修改当前点到点线路的自定义颜色。 */
  onRouteColorChange: (color: string) => void;
  /** 切换当前路线规划交通方式。 */
  onTransportModeChange: (mode: TransportMode) => void;
  /** 点到点路线端点；为空时可能展示定位路线或空态。 */
  pointRoute: PointRouteEndpoints | null;
  /** 高德路线规划返回的方案数据；为空表示未完成或失败。 */
  routePlan: MapRoutePlanResult | null;
  /** 路线规划状态文案，用于 loading、error 和 empty 状态。 */
  routePlanningMessage: string;
  /** 当前路线规划状态。 */
  routePlanningStatus: RoutePlanningStatus;
  /** 已保存的点到点线路摘要列表，用于在线路弹框内切换当前编辑线路。 */
  routeConnections: RouteConnectionSummary[];
  /** 当前点到点线路的自定义颜色；为空时使用交通方式默认颜色。 */
  routeColor: string | null;
  /** 当前已选中的路线方案 id；为空时列表只展示总览，不展开方案详情。 */
  selectedRoutePlanId: string | null;
  /** 当前交通方式。 */
  transportMode: TransportMode;
  /** 用户当前位置；存在时可以展示“当前位置到目标点”的路线。 */
  userLocation: UserLocation | null;
};

/**
 * 已保存线路列表的组件接口。
 */
type RouteConnectionSelectorProps = {
  /** 当前正在查看或编辑的点到点线路 id。 */
  activeRouteId: string | null;
  /** 已保存的点到点线路摘要。 */
  routes: RouteConnectionSummary[];
  /** 点击某条线路时触发，用于切换当前编辑线路。 */
  onSelectRoute: (routeId: string) => void;
};

/**
 * 单条已保存线路卡片的组件接口。
 */
type RouteConnectionCardProps = {
  /** 是否为当前正在查看或编辑的线路。 */
  isActive: boolean;
  /** 当前线路在列表中的序号。 */
  index: number;
  /** 已保存线路摘要。 */
  route: RouteConnectionSummary;
  /** 点击卡片时触发，用于选中这条线路。 */
  onSelect: () => void;
};

/**
 * 右侧按钮组中的已保存线路弹出选择器组件接口。
 */
type RouteConnectionSelectorActionProps = {
  /** 当前正在查看或编辑的点到点线路 id。 */
  activeRouteId: string | null;
  /** 已保存的点到点线路摘要。 */
  routes: RouteConnectionSummary[];
  /** 点击某条线路时触发，用于切换当前编辑线路。 */
  onSelectRoute: (routeId: string) => void;
};

/**
 * 线路标题组件的组件接口。
 */
type RouteTitleProps = {
  /** 是否是当前位置到点位的定位路线。 */
  isLocationRoute: boolean;
  /** 点击点位名称时触发，用于回到点位编辑器。 */
  onSelectMarker: (id: string) => void;
  /** 点到点路线端点；存在时标题会渲染成两个可点击点位名称。 */
  pointRoute: PointRouteEndpoints | null;
  /** 定位路线或空态下的目标点位。 */
  targetMarker: Marker;
};

/**
 * 线路弹框内交通方式切换控件的组件接口。
 */
type RouteTransportModeTabsProps = {
  /** 当前正在使用的交通方式。 */
  transportMode: TransportMode;
  /** 点击交通方式时触发，用于重新规划当前选中的线路。 */
  onTransportModeChange: (mode: TransportMode) => void;
};

/**
 * 线路样式编辑器的组件接口。
 */
type RouteStyleEditorProps = {
  /** 当前线路颜色；为空时表示使用交通方式默认颜色。 */
  color: string | null;
  /** 是否禁用颜色编辑；没有选中点到点线路时禁用。 */
  disabled?: boolean;
  /** 选择颜色时触发，传空字符串表示恢复默认颜色。 */
  onColorChange: (color: string) => void;
};

/**
 * 线路规划操作区的组件接口。
 *
 * 它把交通方式切换和高德候选方案列表组合在一起，形成一个完整的规划编辑区。
 */
type RoutePlanningControlsProps = {
  /** 当前规划状态提示文案。 */
  message: string;
  /** 高德返回并归一化后的路线方案列表。 */
  options: MapRoutePlanOption[];
  /** 选择指定路线方案，用于同步更新地图上绘制的线路。 */
  onSelectRoutePlan: (planId: string) => void;
  /** 切换当前路线规划交通方式。 */
  onTransportModeChange: (mode: TransportMode) => void;
  /** 当前已选中的路线方案 id。 */
  selectedRoutePlanId: string | null;
  /** 当前路线规划状态。 */
  status: RoutePlanningStatus;
  /** 当前交通方式，用于决定切换按钮和方案总览文案。 */
  transportMode: TransportMode;
};

/**
 * 路线方案列表的组件接口。
 *
 * 它负责管理当前展开的方案卡片，只在用户选中某个方案时展示详细步骤。
 */
type RoutePlanOptionsProps = {
  /** 当前规划状态提示文案。 */
  message: string;
  /** 高德返回并归一化后的路线方案列表。 */
  options: MapRoutePlanOption[];
  /** 选择指定路线方案，用于同步更新地图上绘制的线路。 */
  onSelectRoutePlan: (planId: string) => void;
  /** 当前已选中的路线方案 id。 */
  selectedRoutePlanId: string | null;
  /** 当前路线规划状态。 */
  status: RoutePlanningStatus;
  /** 当前交通方式，用于决定标题和总览文案。 */
  transportMode: TransportMode;
};

/**
 * 单条路线方案卡片的组件接口。
 */
type RoutePlanCardProps = {
  /** 是否为当前展开查看详情的方案。 */
  isSelected: boolean;
  /** 是否为主推荐方案；主方案会使用更强调的视觉样式。 */
  isPrimary: boolean;
  /** 用户点击卡片或键盘确认时触发，用于展开或收起详情。 */
  onSelect: () => void;
  /** 当前路线方案数据。 */
  option: MapRoutePlanOption;
  /** 当前交通方式，用于生成方案总览文案。 */
  transportMode: TransportMode;
};

/**
 * 路线方案步骤列表的组件接口。
 */
type RoutePlanStepListProps = {
  /** 当前已选中的路线方案。 */
  option: MapRoutePlanOption;
};

/**
 * 路线指标小块的组件接口。
 */
type RoutePlanStatProps = {
  /** 已格式化好的指标数据，包含图标、标签和值。 */
  metric: RoutePlanMetric;
};

/**
 * 路线概览指标的组件接口。
 */
type MetricProps = {
  /** 指标名称，例如距离、预计、费用或点位。 */
  label: string;
  /** 已格式化好的指标值。 */
  value: string;
};

export function RouteDetail({
  activePointRouteId,
  locationRouteTarget,
  marker,
  onActionSlotChange,
  onDeleteRoute,
  onSelectMarker,
  onSelectPointRoute,
  onSelectRoutePlan,
  onRouteColorChange,
  onTransportModeChange,
  pointRoute,
  routePlan,
  routePlanningMessage,
  routePlanningStatus,
  routeConnections,
  routeColor,
  selectedRoutePlanId,
  transportMode,
  userLocation,
}: RouteDetailProps) {
  const isPointRoute = Boolean(pointRoute);
  const isLocationRoute = Boolean(
    !isPointRoute && userLocation && locationRouteTarget,
  );
  const hasActiveRoute = isPointRoute || isLocationRoute;
  const targetMarker = locationRouteTarget ?? marker;
  const routeFrom = pointRoute
    ? pointRoute.from.lngLat
    : isLocationRoute
      ? userLocation?.lngLat
      : null;
  const routeTo = pointRoute
    ? pointRoute.to.lngLat
    : isLocationRoute
      ? targetMarker.lngLat
      : null;
  const routeDistanceMeters =
    hasActiveRoute && routePlan?.plans[0]?.distance
      ? routePlan.plans[0].distance
      : routeFrom && routeTo
        ? getDistanceMeters(routeFrom, routeTo)
        : 0;
  const routePointCount = hasActiveRoute ? 2 : 0;
  const routeTitle = pointRoute
    ? `${pointRoute.from.name} → ${pointRoute.to.name}`
    : isLocationRoute
      ? `当前位置 → ${targetMarker.name}`
      : "暂无线路";
  const selectedRoutePlan =
    hasActiveRoute && selectedRoutePlanId
      ? routePlan?.plans.find((plan) => plan.id === selectedRoutePlanId) ?? null
      : null;
  const primaryPlan = hasActiveRoute
    ? selectedRoutePlan ?? routePlan?.plans[0] ?? null
    : null;
  const routePlans = hasActiveRoute ? routePlan?.plans ?? [] : [];
  const routeOptionsKey = [
    transportMode,
    routeTitle,
    routePlans
      .map((option) => `${option.id}:${option.distance}:${option.duration}`)
      .join("|"),
  ].join("::");

  useEffect(() => {
    const actionButtons: ReactNode[] = [];

    if (routeConnections.length > 0) {
      actionButtons.push(
        <RouteConnectionSelectorAction
          activeRouteId={activePointRouteId}
          key="route-connection-selector"
          onSelectRoute={onSelectPointRoute}
          routes={routeConnections}
        />,
      );
    }

    if (hasActiveRoute) {
      actionButtons.push(
        <Button
          aria-label="删除线路"
          className="tool-panel-action-button text-destructive hover:bg-destructive/10 hover:text-destructive"
          key="delete-route"
          onClick={onDeleteRoute}
          size="icon"
          title="删除线路"
          variant="ghost"
        >
          <Trash2 className="size-5" />
        </Button>,
      );
    }

    onActionSlotChange(...actionButtons);

    return () => onActionSlotChange();
  }, [
    activePointRouteId,
    hasActiveRoute,
    onActionSlotChange,
    onDeleteRoute,
    onSelectPointRoute,
    routeConnections,
  ]);

  return (
    <>
      <section className="rounded-lg border border-border bg-background/70 p-3">
        <RouteTitle
          isLocationRoute={isLocationRoute}
          onSelectMarker={onSelectMarker}
          pointRoute={pointRoute}
          targetMarker={targetMarker}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric
            label={isPointRoute || isLocationRoute ? "直线距" : "距离"}
            value={hasActiveRoute ? formatDistanceMeters(routeDistanceMeters) : "--"}
          />
          <Metric
            label="预计"
            value={primaryPlan ? formatDurationSeconds(primaryPlan.duration) : "--"}
          />
          <Metric
            label={
              transportMode === "ride" || transportMode === "walk"
                ? "点位"
                : "费用"
            }
            value={
              !hasActiveRoute
                ? "--"
                : transportMode === "ride" || transportMode === "walk"
                ? String(routePointCount)
                : primaryPlan
                  ? formatRouteCost(primaryPlan)
                  : "--"
            }
          />
        </div>
        <RouteStyleEditor
          color={routeColor}
          disabled={!activePointRouteId}
          onColorChange={onRouteColorChange}
        />
      </section>

      <RoutePlanningControls
        key={routeOptionsKey}
        message={routePlanningMessage}
        onSelectRoutePlan={onSelectRoutePlan}
        onTransportModeChange={onTransportModeChange}
        options={routePlans}
        selectedRoutePlanId={selectedRoutePlanId}
        status={routePlanningStatus}
        transportMode={transportMode}
      />
    </>
  );
}

function RouteConnectionSelectorAction({
  activeRouteId,
  routes,
  onSelectRoute,
}: RouteConnectionSelectorActionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  const isOpen = routes.length > 0 && (isHovered || isPinnedOpen);

  return (
    <div
      className="tool-panel-action-popover-anchor"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Button
        aria-expanded={isOpen}
        aria-label={isOpen ? "收起已保存线路" : "展开已保存线路"}
        aria-pressed={isPinnedOpen}
        className={cn(
          "tool-panel-action-button",
          isOpen &&
            "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        )}
        disabled={routes.length === 0}
        onClick={() => setIsPinnedOpen((currentState) => !currentState)}
        size="icon"
        title="已保存线路"
        variant="ghost"
      >
        <Route className="size-5" />
      </Button>

      {isOpen && (
        <div className="tool-panel-action-popover w-80 max-w-[calc(100vw-96px)] rounded-lg border border-border bg-card/95 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl">
          <RouteConnectionSelector
            activeRouteId={activeRouteId}
            onSelectRoute={(routeId) => {
              onSelectRoute(routeId);
              setIsPinnedOpen(false);
              setIsHovered(false);
            }}
            routes={routes}
          />
        </div>
      )}
    </div>
  );
}

function RouteTitle({
  isLocationRoute,
  onSelectMarker,
  pointRoute,
  targetMarker,
}: RouteTitleProps) {
  if (pointRoute) {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-1 text-sm font-semibold text-center">
        <Button
          aria-label={`打开 ${pointRoute.from.name} 点位编辑`}
          className="h-auto min-w-0 flex-1 shrink overflow-hidden px-0 py-0 text-sm font-semibold"
          onClick={() => onSelectMarker(pointRoute.from.id)}
          title={`打开 ${pointRoute.from.name} 点位编辑`}
          variant="ghost"
        >
          <span className="block min-w-0 truncate">{pointRoute.from.name}</span>
        </Button>

        <span className="shrink-0 text-muted-foreground">→</span>
        <Button
          aria-label={`打开 ${pointRoute.to.name} 点位编辑`}
          className="h-auto min-w-0 flex-1 shrink overflow-hidden px-0 py-0 text-sm font-semibold"
          onClick={() => onSelectMarker(pointRoute.to.id)}
          title={`打开 ${pointRoute.to.name} 点位编辑`}
          variant="ghost"
        >
          <span className="block min-w-0 truncate">{pointRoute.to.name}</span>
        </Button> 
      </div>
    );
  }

  if (isLocationRoute) {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-1 text-sm font-semibold">
        <span className="shrink-0">当前位置</span>
        <span className="shrink-0 text-muted-foreground">→</span>
         <Button
          aria-label={`打开 ${targetMarker.name} 点位编辑`}
          className="h-auto min-w-0 flex-1 shrink justify-start overflow-hidden px-0 py-0 text-sm font-semibold hover:bg-transparent hover:text-primary text-center"
          onClick={() => onSelectMarker(targetMarker.id)}
          title={`打开 ${targetMarker.name} 点位编辑`}
          variant="ghost"
        >
          <span className="block min-w-0 truncate">{targetMarker.name}</span>
        </Button> 
      </div>
    );
  }

  return <div className="mt-1 truncate text-sm font-semibold">暂无线路</div>;
}

function RoutePlanningControls({
  message,
  onSelectRoutePlan,
  onTransportModeChange,
  options,
  selectedRoutePlanId,
  status,
  transportMode,
}: RoutePlanningControlsProps) {
  return (
    <div className="space-y-4">
      <RouteTransportModeTabs
        onTransportModeChange={onTransportModeChange}
        transportMode={transportMode}
      />
      <RoutePlanOptions
        message={message}
        onSelectRoutePlan={onSelectRoutePlan}
        options={options}
        selectedRoutePlanId={selectedRoutePlanId}
        status={status}
        transportMode={transportMode}
      />
    </div>
  );
}

function RouteTransportModeTabs({
  transportMode,
  onTransportModeChange,
}: RouteTransportModeTabsProps) {
  return (
    <section className="space-y-2">
      <Label>交通方式</Label>
      <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
        {transportTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = transportMode === tab.id;

          return (
            <Button
              aria-label={`切换为${tab.label}`}
              aria-pressed={isActive}
              className={cn(
                "h-9 justify-center gap-1.5 px-2 text-xs",
                isActive &&
                  "bg-background text-foreground shadow-sm hover:bg-background",
              )}
              key={tab.id}
              onClick={() => onTransportModeChange(tab.id)}
              size="sm"
              title={tab.label}
              variant="ghost"
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{tab.label}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function RouteStyleEditor({
  color,
  disabled = false,
  onColorChange,
}: RouteStyleEditorProps) {
  const selectedColor = color ?? "";

  return (
    <section className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          aria-label="使用交通方式默认颜色"
          aria-pressed={!selectedColor}
          className={cn(
            "grid size-7 place-items-center rounded-md border border-border bg-background shadow-sm transition disabled:pointer-events-none disabled:opacity-50",
            !selectedColor && "ring-2 ring-ring ring-offset-2",
          )}
          disabled={disabled}
          onClick={() => onColorChange("")}
          title="默认颜色"
          type="button"
        >
          <span className="size-4 rounded-full bg-gradient-to-br from-blue-600 via-teal-600 to-orange-500" />
        </button>

        {routeColorOptions.map((option) => (
          <button
            aria-label={`线路颜色：${option.label}`}
            aria-pressed={selectedColor === option.value}
            className={cn(
              "size-7 rounded-md border border-white shadow-sm transition hover:scale-105 disabled:pointer-events-none disabled:opacity-50",
              selectedColor === option.value && "ring-2 ring-ring ring-offset-2",
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onColorChange(option.value)}
            style={{ backgroundColor: option.value }}
            title={option.label}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

function RouteConnectionSelector({
  activeRouteId,
  routes,
  onSelectRoute,
}: RouteConnectionSelectorProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>已保存线路</Label>
        <Badge variant="outline">{routes.length} 条</Badge>
      </div>

      {routes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/70 p-3 text-sm text-muted-foreground">
          暂无已保存线路
        </div>
      ) : (
        <div className="max-h-44 space-y-2 overflow-auto rounded-lg border border-border bg-background/60 p-2">
          {routes.map((route, index) => (
            <RouteConnectionCard
              index={index + 1}
              isActive={activeRouteId === route.id}
              key={route.id}
              onSelect={() => onSelectRoute(route.id)}
              route={route}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RouteConnectionCard({
  isActive,
  index,
  route,
  onSelect,
}: RouteConnectionCardProps) {
  const modeLabel = route.mode ? getTransportModeLabel(route.mode) : "待规划";
  const metric =
    route.status === "planned" && route.distance && route.duration
      ? `${formatDistanceMeters(route.distance)} / ${formatDurationSeconds(
          route.duration,
        )}`
      : "等待高德规划";

  return (
    <Button
      aria-pressed={isActive}
      className={cn(
        "h-auto w-full justify-start gap-3 border px-3 py-2 text-left",
        isActive
          ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-background hover:bg-muted",
      )}
      onClick={onSelect}
      variant="ghost"
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
          isActive
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {route.from.name} → {route.to.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {route.planTitle ?? modeLabel} · {metric}
        </span>
      </span>
      {route.color && (
        <span
          aria-label="线路颜色"
          className="size-3 shrink-0 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: route.color }}
        />
      )}
      <Badge variant={isActive ? "default" : "secondary"}>{modeLabel}</Badge>
    </Button>
  );
}

function RoutePlanOptions({
  message,
  onSelectRoutePlan,
  options,
  selectedRoutePlanId,
  status,
  transportMode,
}: RoutePlanOptionsProps) {
  const isLoading = status === "loading";
  const isError = status === "error";
  const isEmpty = !isLoading && !isError && options.length === 0;
  const resolvedSelectedPlanId = options.some(
    (option) => option.id === selectedRoutePlanId,
  )
    ? selectedRoutePlanId
    : null;

  return (
    <section className="space-y-2">
      {(isLoading || isError || isEmpty) && (
        <div
          className={cn(
            "rounded-lg border border-border bg-background/70 p-3 text-sm",
            isError && "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {message}
        </div>
      )}

      <div className="space-y-2">
        {options.map((option, index) => (
          <RoutePlanCard
            isSelected={resolvedSelectedPlanId === option.id}
            isPrimary={index === 0}
            key={option.id}
            onSelect={() => onSelectRoutePlan(option.id)}
            option={option}
            transportMode={transportMode}
          />
        ))}
      </div>
    </section>
  );
}

function getTransportModeLabel(mode: TransportMode) {
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

function RoutePlanCard({
  isSelected,
  isPrimary,
  onSelect,
  option,
  transportMode,
}: RoutePlanCardProps) {
  const metrics = getRoutePlanMetrics(option);

  return (
    <article
      aria-expanded={isSelected}
      className={cn(
        "space-y-3 rounded-lg border border-border bg-background/70 p-3 outline-none transition-colors",
        isPrimary && "border-primary/40 bg-primary/5",
        isSelected && "border-primary bg-primary/10",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
            isPrimary && "border-primary/30 text-primary",
          )}
        >
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{option.title}</div>
            <Badge variant={isPrimary ? "default" : "secondary"}>
              {option.badge}
            </Badge>
            {isSelected && <Badge variant="outline">详情</Badge>}
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {getRoutePlanOverview(option, transportMode)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <RoutePlanStat key={metric.label} metric={metric} />
        ))}
      </div>

      {isSelected && <RoutePlanStepList option={option} />}

      {option.warning && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{option.warning}</span>
        </div>
      )}
    </article>
  );
}

function RoutePlanStepList({ option }: RoutePlanStepListProps) {
  if (option.steps.length === 0) {
    return (
      <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
        高德已返回路线结果，暂无分步说明。
      </div>
    );
  }

  return (
    <div className="max-h-56 space-y-1 overflow-auto rounded-md bg-muted/60 p-2">
      {option.steps.map((step, index) => (
        <div
          className="flex items-start gap-2 text-xs leading-5"
          key={`${option.id}-${index}-${step.instruction}`}
        >
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">{step.instruction}</span>
        </div>
      ))}
    </div>
  );
}

function RoutePlanStat({ metric }: RoutePlanStatProps) {
  const Icon = metric.icon;

  return (
    <div className="min-w-0 rounded-md border border-border bg-background/80 p-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        <span>{metric.label}</span>
      </div>
      <div className="mt-1 truncate text-xs font-semibold">{metric.value}</div>
    </div>
  );
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-lg border border-border bg-background/70 text-center">
      <div className="text-[11px] text-muted-foreground">{label}:{value}</div>
    </div>
  );
}

function getRoutePlanDescription(option: MapRoutePlanOption) {
  if (option.steps.length === 0) {
    return "高德已返回路线结果，暂无分步说明。";
  }

  return `高德返回 ${option.steps.length} 个行程步骤，地图路线已按该方案绘制。`;
}

function getRoutePlanOverview(
  option: MapRoutePlanOption,
  transportMode: TransportMode,
) {
  const overviewSteps =
    transportMode === "transit"
      ? option.steps.filter((step) => !step.instruction.startsWith("步行 "))
      : option.steps;
  const overview = overviewSteps
    .slice(0, 3)
    .map((step) => step.instruction)
    .filter(Boolean)
    .join(" → ");

  if (overview) {
    return overview;
  }

  return getRoutePlanDescription(option);
}

function getRoutePlanMetrics(option: MapRoutePlanOption): RoutePlanMetric[] {
  return [
    {
      icon: Milestone,
      label: "距离",
      value: formatDistanceMeters(option.distance),
    },
    {
      icon: Clock,
      label: "预计",
      value: formatDurationSeconds(option.duration),
    },
    {
      icon: BadgeDollarSign,
      label: option.costLabel ?? "费用",
      value: formatRouteCost(option),
    },
  ];
}
