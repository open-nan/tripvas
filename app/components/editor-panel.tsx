"use client";

import { Fragment, type ReactNode, useCallback, useState } from "react";
import { ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MarkerDetail } from "./marker-detail";
import { panelTitles } from "./map-editor-data";
import type {
  MapRoutePlanResult,
  Marker,
  PanelMode,
  PointRouteEndpoints,
  RouteConnectionSummary,
  RoutePlanningStatus,
  TransportMode,
  UserLocation,
} from "./map-editor-types";
import { RouteDetail } from "./route-detail";

/**
 * 地图编辑器左侧工具面板的组件接口。
 *
 * EditorPanel 只负责面板壳、模式切换和工具按钮栏承载；具体点位、路线、图层内容
 * 由子组件实现，子组件可以通过 onActionSlotChange 把自己的工具按钮注册到右侧按钮组。
 */
type EditorPanelProps = {
  /** 当前正在查看或编辑的点到点线路 id；没有点到点线路时为空。 */
  activePointRouteId: string | null;
  /** 面板是否处于收起状态；收起时面板内容隐藏，但右侧按钮组仍保留。 */
  isCollapsed: boolean;
  /** 定位路线的目标点位；为空表示当前没有从用户位置发起的路线。 */
  locationRouteTarget: Marker | null;
  /** 当前选中的点位，也是点位详情面板的编辑对象。 */
  marker: Marker;
  /** 当前选中点位在地图点位列表里的动态序号。 */
  markerNumber: number;
  /** 所有点位 id 到动态序号的映射，用于点位详情和线路候选列表保持同一套编号。 */
  markerNumberById: Record<string, number>;
  /** 当前面板模式：点位、路线或图层。 */
  mode: PanelMode;
  /** 点击默认加号按钮时触发，用于创建新点位。 */
  onAddMarker: () => void;
  /** 切换面板展开/收起状态。 */
  onCollapseChange: (collapsed: boolean) => void;
  /** 取消当前点到点线路连接等待状态。 */
  onCancelRouteConnection: () => void;
  /** 使用当前线路连接源点和目标点创建一条点到点路线。 */
  onCreateRouteConnection: (targetMarkerId: string) => void;
  /** 删除当前正在查看或编辑的路线，并清空地图上的路线覆盖物。 */
  onDeleteRoute: () => void;
  /** 选择某个点位，通常从路线端点或点位列表触发。 */
  onSelectMarker: (id: string) => void;
  /** 在线路弹框中选择某条已保存线路，并切换到该线路的编辑状态。 */
  onSelectPointRoute: (routeId: string) => void;
  /** 选择某个路线候选方案，用于同步更新地图线路。 */
  onSelectRoutePlan: (planId: string) => void;
  /** 修改当前线路的自定义颜色。 */
  onRouteColorChange: (color: string) => void;
  /** 从指定点位发起线路连接，之后可点选目标点完成连接。 */
  onStartRouteConnection: (sourceMarkerId: string) => void;
  /** 切换路线规划交通方式。 */
  onTransportModeChange: (mode: TransportMode) => void;
  /** 更新当前点位的局部字段。 */
  onUpdateMarker: (updates: Partial<Marker>) => void;
  /** 当前点到点路线端点；为空时路线面板展示空态或定位路线。 */
  pointRoute: PointRouteEndpoints | null;
  /** 高德路线规划返回的当前路线方案；为空表示尚未规划成功。 */
  routePlan: MapRoutePlanResult | null;
  /** 路线规划状态文案，用于 loading/error/empty 提示。 */
  routePlanningMessage: string;
  /** 路线规划状态，用于决定展示结果、加载态还是错误态。 */
  routePlanningStatus: RoutePlanningStatus;
  /** 当前已选中的路线方案 id；为空时路线列表只展示总览。 */
  selectedRoutePlanId: string | null;
  /** 当前点位还能连接的候选点位，已排除自身和已经连接过的点。 */
  routeConnectionCandidates: Marker[];
  /** 已创建的点到点线路摘要，用于线路弹框内选择当前编辑线路。 */
  routeConnections: RouteConnectionSummary[];
  /** 当前正在等待目标点的线路连接源点 id；为空表示没有等待状态。 */
  routeConnectionSourceId: string | null;
  /** 当前点到点线路的自定义颜色；为空时使用交通方式默认颜色。 */
  routeColor: string | null;
  /** 当前交通方式。 */
  transportMode: TransportMode;
  /** 浏览器定位得到的用户当前位置；为空表示尚未定位或定位已关闭。 */
  userLocation: UserLocation | null;
};

/**
 * 工具面板右侧按钮组的组件接口。
 *
 * 这个按钮组始终保留默认新增点位按钮，并把当前详情组件注册进来的按钮渲染在后面。
 */
type ToolPanelActionBarProps = {
  /** 当前面板内容注册的扩展工具按钮，例如点位搜索、线路连接或删除当前线路等。 */
  children?: ReactNode;
  /** 默认加号按钮点击回调，用于新增地图点位。 */
  onAddMarker: () => void;
};

/**
 * 图层设置项的组件接口。
 *
 * 当前图层面板仍是原型，这个开关只负责表达图层开关的 UI 状态。
 */
type LayerToggleProps = {
  /** 开关默认是否选中。 */
  checked: boolean;
  /** 开关展示文案。 */
  label: string;
};

export function EditorPanel({
  activePointRouteId,
  isCollapsed,
  locationRouteTarget,
  marker,
  markerNumber,
  markerNumberById,
  mode,
  onAddMarker,
  onCollapseChange,
  onCancelRouteConnection,
  onCreateRouteConnection,
  onDeleteRoute,
  onSelectMarker,
  onSelectPointRoute,
  onSelectRoutePlan,
  onRouteColorChange,
  onStartRouteConnection,
  onTransportModeChange,
  onUpdateMarker,
  pointRoute,
  routePlan,
  routePlanningMessage,
  routePlanningStatus,
  routeConnectionCandidates,
  routeConnections,
  routeConnectionSourceId,
  routeColor,
  selectedRoutePlanId,
  transportMode,
  userLocation,
}: EditorPanelProps) {
  const [toolPanelActionSlot, setToolPanelActionSlot] =
    useState<ReactNode[]>([]);
  const handleToolPanelActionSlotChange = useCallback(
    (...slot: ReactNode[]) => setToolPanelActionSlot(slot),
    [],
  );

  return (
    <div
      aria-expanded={!isCollapsed}
      className={cn(
        "editor-panel-shell",
        isCollapsed && "editor-panel-shell-collapsed",
      )}
    >
      <Card
        aria-hidden={isCollapsed}
        className={cn(
          "editor-panel border-border/90 bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-xl",
          isCollapsed && "editor-panel-collapsed",
        )}
      >
        {!isCollapsed && (
          <>
            <CardHeader className="relative gap-4 p-4 pb-3">
              <Button
                aria-label="收起工具面板"
                className="absolute right-3 top-3 size-8"
                onClick={() => onCollapseChange(true)}
                size="icon"
                title="收起工具面板"
                variant="ghost"
              >
                <ChevronLeft className="hidden size-4 md:block" />
                <ChevronDown className="size-4 md:hidden" />
              </Button>

              <div className="space-y-2 pr-10">
                <CardTitle className="text-base font-semibold tracking-normal">
                  {panelTitles[mode]}
                </CardTitle>
              </div>

            </CardHeader>

            <CardContent className="panel-content space-y-4 px-4 pb-4 pt-0">
              {mode === "marker" && (
                <MarkerDetail
                  isRouteConnectionActive={routeConnectionSourceId === marker.id}
                  marker={marker}
                  markerNumber={markerNumber}
                  markerNumberById={markerNumberById}
                  onActionSlotChange={handleToolPanelActionSlotChange}
                  onCancelRouteConnection={onCancelRouteConnection}
                  onCreateRouteConnection={onCreateRouteConnection}
                  onStartRouteConnection={onStartRouteConnection}
                  onUpdateMarker={onUpdateMarker}
                  routeConnectionCandidates={routeConnectionCandidates}
                />
              )}

              {mode === "route" && (
                <RouteDetail
                  locationRouteTarget={locationRouteTarget}
                  marker={marker}
                  onActionSlotChange={handleToolPanelActionSlotChange}

                  onDeleteRoute={onDeleteRoute}
                  onSelectMarker={onSelectMarker}
                  onSelectPointRoute={onSelectPointRoute}
                  onSelectRoutePlan={onSelectRoutePlan}
                  onRouteColorChange={onRouteColorChange}
                  onTransportModeChange={onTransportModeChange}
                  
                  pointRoute={pointRoute}
                  routePlan={routePlan}
                  routePlanningMessage={routePlanningMessage}
                  routePlanningStatus={routePlanningStatus}
                  routeConnections={routeConnections}
                  routeColor={routeColor}
                  activePointRouteId={activePointRouteId}
                  selectedRoutePlanId={selectedRoutePlanId}
                  transportMode={transportMode}
                  userLocation={userLocation}
                />
              )}

              {mode === "layers" && <LayerDetail />}
            </CardContent>
          </>
        )}
      </Card>

      <ToolPanelActionBar onAddMarker={onAddMarker}>
        {toolPanelActionSlot.map((action, index) => (
          <Fragment key={index}>{action}</Fragment>
        ))}
      </ToolPanelActionBar>
    </div>
  );
}

function ToolPanelActionBar({
  children,
  onAddMarker,
}: ToolPanelActionBarProps) {
  return (
    <div className="tool-panel-action-bar" aria-label="工具面板按钮组">
      <Button
        aria-label="新增点位"
        className="tool-panel-action-button"
        onClick={onAddMarker}
        size="icon"
        title="新增点位"
      >
        <Plus className="size-5" />
      </Button>
      {children}
    </div>
  );
}

/**
 * 图层原型面板。
 *
 * 当前没有外部 props，只展示静态图层开关和白板层提示；后续接入真实图层状态时
 * 再提取独立 props 接口。
 */
function LayerDetail() {
  return (
    <>
      <section className="space-y-2">
        <LayerToggle checked label="高德标准图层" />
        <LayerToggle checked label="路线与点位覆盖层" />
        <LayerToggle checked={false} label="卫星影像" />
        <LayerToggle checked={false} label="实时路况" />
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="watermark">白板水印</Label>
          <Badge variant="outline">38%</Badge>
        </div>
        <input
          className="h-2 w-full accent-primary"
          defaultValue={38}
          id="watermark"
          max={100}
          min={0}
          type="range"
        />
      </section>

      <section className="rounded-lg border border-dashed border-border bg-background/70 p-3">
        <div className="text-sm font-semibold">白板层</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          右侧工具栏会控制白板对象，地图点位仍通过当前面板编辑。
        </p>
      </section>
    </>
  );
}

function LayerToggle({
  checked,
  label,
}: LayerToggleProps) {
  return (
    <label className="flex h-11 items-center justify-between rounded-lg border border-border bg-background/70 px-3 text-sm">
      <span>{label}</span>
      <input
        className="size-4 accent-primary"
        defaultChecked={checked}
        type="checkbox"
      />
    </label>
  );
}
