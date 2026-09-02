"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Route, Search, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { kindLabels, markerStyleOptions } from "./map-editor-data";
import { SearchPanel } from "./SearchPanel";
import type {
  Marker,
  MarkerKind,
  PlaceSuggestion,
  ToolPanelActionSlotChange,
} from "./map-editor-types";
import { formatPlaceAddress } from "./map-editor-utils";

/**
 * 点位详情面板的组件接口。
 *
 * 面板只负责展示和编辑当前选中的单个点位；搜索按钮和锁定按钮会通过
 * onActionSlotChange 注册到工具面板右侧按钮组里。
 */
type MarkerDetailProps = {
  /** 当前点位是否已经处于等待用户选择线路目标点的状态。 */
  isRouteConnectionActive: boolean;
  /** 当前正在编辑的点位。 */
  marker: Marker;
  /** 当前点位在地图点位列表里的动态序号，与地图上的圆底数字保持一致。 */
  markerNumber: number;
  /** 所有点位 id 到动态序号的映射，用于弹层候选列表复用地图上的排序数字。 */
  markerNumberById: Record<string, number>;
  /**
   * 替换工具面板按钮组的扩展按钮。
   *
   * MarkerDetail 会注册地点搜索、线路规划和锁定按钮；组件卸载时应清空这些按钮，
   * 避免切换到路线或图层面板后还保留点位工具。
   */
  onActionSlotChange: ToolPanelActionSlotChange;
  /** 取消当前点到点线路连接等待状态。 */
  onCancelRouteConnection: () => void;
  /** 将当前点位连接到指定目标点，并进入路线详情。 */
  onCreateRouteConnection: (targetMarkerId: string) => void;
  /**
   * 从当前点位发起点到点线路连接。
   *
   * 打开右侧线路弹层时调用；之后用户可以点击弹层列表，也可以点地图上的另一个点完成连接。
   */
  onStartRouteConnection: (sourceMarkerId: string) => void;
  /**
   * 更新当前点位的局部字段。
   *
   * 这里通常用于名称、锁定态和点位类型；坐标更新主要由地图拖动事件触发。
   */
  onUpdateMarker: (updates: Partial<Marker>) => void;
  /** 当前点位仍可连接的目标点集合，已排除自身和已经连接过的点。 */
  routeConnectionCandidates: Marker[];
};

/**
 * 点位详情里线路连接弹层的组件接口。
 */
type MarkerRouteConnectionPanelProps = {
  /** 当前作为线路起点的点位。 */
  marker: Marker;
  /** 所有点位 id 到动态序号的映射。 */
  markerNumberById: Record<string, number>;
  /** 还没有与当前点位建立过连接的候选点位。 */
  routeConnectionCandidates: Marker[];
  /** 点击候选点位时触发，立即创建点到点线路。 */
  onCreateRouteConnection: (targetMarkerId: string) => void;
};

/**
 * 点位概览卡片的组件接口。
 */
type MarkerSummaryCardProps = {
  /** 当前正在展示的点位。 */
  marker: Marker;
  /** 当前点位在地图点位列表里的动态序号。 */
  markerNumber: number;
  /** 名称输入框是否处于编辑聚焦状态。 */
  isNameEditing: boolean;
  /** 点击概览名称时触发，用于进入名称编辑状态。 */
  onStartNameEditing: () => void;
};

/**
 * 点位样式预览图形的组件接口。
 */
type MarkerStyleGlyphProps = {
  /** 当前要预览的点位视觉样式。 */
  kind: MarkerKind;
  /** 点位颜色。 */
  color: string;
  /** 是否使用锁定态实线圆圈；未锁定时使用虚线圆圈。 */
  locked?: boolean;
  /** 圆底镂空数字样式中展示的示例数字。 */
  number?: number;
};

/**
 * 点位颜色选择器的组件接口。
 */
type MarkerColorPickerProps = {
  /** 当前点位颜色。 */
  color: string;
  /** 是否禁用颜色选择。 */
  disabled?: boolean;
  /** 选择颜色时触发，用于更新当前点位。 */
  onColorChange: (color: string) => void;
};

const markerColorOptions = [
  { label: "青绿", value: "#0f766e" },
  { label: "琥珀", value: "#d97706" },
  { label: "天蓝", value: "#0284c7" },
  { label: "玫红", value: "#be123c" },
  { label: "紫色", value: "#7c3aed" },
  { label: "深色", value: "#111827" },
];

export function MarkerDetail({
  isRouteConnectionActive,
  marker,
  markerNumber,
  markerNumberById,
  onActionSlotChange,
  onCancelRouteConnection,
  onCreateRouteConnection,
  onStartRouteConnection,
  onUpdateMarker,
  routeConnectionCandidates,
}: MarkerDetailProps) {
  const canSearchMarker = !marker.locked;
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [nameEditingMarkerId, setNameEditingMarkerId] = useState<string | null>(
    null,
  );
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isRouteOpen, setRouteOpen] = useState(false);
  const isNameEditing = nameEditingMarkerId === marker.id && !marker.locked;
  const isRouteActionActive = isRouteOpen || isRouteConnectionActive;

  const handleStartNameEditing = useCallback(() => {
    if (marker.locked) {
      return;
    }

    setNameEditingMarkerId(marker.id);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }, [marker.id, marker.locked]);

  const handleSearchOpenChange = useCallback(
    (open: boolean) => {
      setSearchOpen(open);

      if (open) {
        setRouteOpen(false);
        onCancelRouteConnection();
      }
    },
    [onCancelRouteConnection],
  );

  const handleRouteOpenChange = useCallback(
    (open: boolean) => {
      setRouteOpen(open);

      if (open) {
        setSearchOpen(false);
        onStartRouteConnection(marker.id);
        return;
      }

      onCancelRouteConnection();
    },
    [marker.id, onCancelRouteConnection, onStartRouteConnection],
  );

  const handleToggleLock = useCallback(() => {
    const nextLocked = !marker.locked;

    if (nextLocked) {
      setSearchOpen(false);
      setNameEditingMarkerId(null);
    }

    onUpdateMarker({ locked: nextLocked });
  }, [marker.locked, onUpdateMarker]);

  const handleApplyPlace = useCallback(
    (place: PlaceSuggestion) => {
      if (marker.locked) {
        return;
      }

      onUpdateMarker({
        address: formatPlaceAddress(place),
        lngLat: place.lngLat,
        name: place.name,
      });

      setSearchOpen(false);
    },
    [marker.locked, onUpdateMarker],
  );

  const handleCreateRouteConnection = useCallback(
    (targetMarkerId: string) => {
      onCreateRouteConnection(targetMarkerId);
      setRouteOpen(false);
    },
    [onCreateRouteConnection],
  );

  useEffect(() => {
    return () => onCancelRouteConnection();
  }, [onCancelRouteConnection]);

  const actionSlot = useMemo(
    () => [
      <div className="tool-panel-action-popover-anchor" key="marker-search">
        <Button
          aria-label={isSearchOpen ? "收起地点搜索" : "展开地点搜索"}
          aria-pressed={isSearchOpen}
          className={cn(
            "tool-panel-action-button",
            isSearchOpen &&
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          )}
          disabled={!canSearchMarker}
          onClick={() => handleSearchOpenChange(!isSearchOpen)}
          size="icon"
          title={canSearchMarker ? "地点搜索" : "锁定后不可重新绑定地点"}
          variant="ghost"
        >
          <Search className="size-5" />
        </Button>
        {canSearchMarker && isSearchOpen && (
          <div className="tool-panel-action-popover">
            <SearchPanel
              onApplyPlace={handleApplyPlace}
            />
          </div>
        )}
      </div>,
      <div className="tool-panel-action-popover-anchor" key="marker-route">
        <Button
          aria-label={isRouteActionActive ? "收起线路规划" : "展开线路规划"}
          aria-pressed={isRouteActionActive}
          className={cn(
            "tool-panel-action-button",
            isRouteActionActive &&
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          )}
          onClick={() => handleRouteOpenChange(!isRouteActionActive)}
          size="icon"
          title="线路规划"
          variant="ghost"
        >
          <Route className="size-5" />
        </Button>
        {isRouteActionActive && (
          <div className="tool-panel-action-popover">
            <MarkerRouteConnectionPanel
              marker={marker}
              markerNumberById={markerNumberById}
              onCreateRouteConnection={handleCreateRouteConnection}
              routeConnectionCandidates={routeConnectionCandidates}
            />
          </div>
        )}
      </div>,
      <Button
        aria-label={marker.locked ? "解锁点位" : "锁定点位"}
        className="tool-panel-action-button"
        key="marker-lock"
        onClick={handleToggleLock}
        size="icon"
        title={marker.locked ? "解锁点位" : "锁定点位"}
        variant={marker.locked ? "secondary" : "ghost"}
      >
        {marker.locked ? (
          <Lock className="size-4" />
        ) : (
          <Unlock className="size-4" />
        )}
      </Button>,
    ],
    [
      canSearchMarker,
      handleApplyPlace,
      handleCreateRouteConnection,
      handleRouteOpenChange,
      handleSearchOpenChange,
      handleToggleLock,
      isRouteActionActive,
      isSearchOpen,
      marker,
      markerNumberById,
      routeConnectionCandidates,
    ],
  );

  useEffect(() => {
    onActionSlotChange(...actionSlot);
  }, [actionSlot, onActionSlotChange]);

  useEffect(() => {
    return () => onActionSlotChange();
  }, [onActionSlotChange]);

  return (
    <>
      <MarkerSummaryCard
        isNameEditing={isNameEditing}
        marker={marker}
        markerNumber={markerNumber}
        onStartNameEditing={handleStartNameEditing}
      />

      <section className="space-y-2">
        <Label htmlFor="marker-name">名称</Label>
        <Input
          className="marker-name-input"
          disabled={marker.locked}
          id="marker-name"
          onBlur={() => setNameEditingMarkerId(null)}
          onChange={(event) => onUpdateMarker({ name: event.target.value })}
          onFocus={() => setNameEditingMarkerId(marker.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          ref={nameInputRef}
          value={marker.name}
        />
        {marker.locked && (
          <p className="text-xs leading-5 text-muted-foreground">
            点位已锁定，解锁后可修改名称和地点绑定。
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Label>点位样式</Label>
        <div className="grid grid-cols-4 gap-2">
          {markerStyleOptions.map((option) => (
            <Button
              aria-pressed={marker.kind === option.id}
              className={cn(
                "h-16 flex-col gap-1 px-1 text-xs",
                marker.kind === option.id &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              disabled={marker.locked}
              key={option.id}
              onClick={() => onUpdateMarker({ kind: option.id })}
              variant="outline"
            >
              <MarkerStyleGlyph
                color={marker.color}
                kind={option.id}
                locked={marker.locked}
                number={markerNumber}
              />
            </Button>
          ))}
        </div>
      </section>

      <MarkerColorPicker
        color={marker.color}
        disabled={marker.locked}
        onColorChange={(color) => onUpdateMarker({ color })}
      />
    </>
  );
}

function MarkerSummaryCard({
  marker,
  markerNumber,
  isNameEditing,
  onStartNameEditing,
}: MarkerSummaryCardProps) {
  const markerName = marker.name.trim() || "未命名点位";

  return (
    <section className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-start gap-3">
        <MarkerStyleGlyph
          color={marker.color}
          kind={marker.kind}
          locked={marker.locked}
          number={markerNumber}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {marker.locked ? (
              <div className="min-w-0 truncate text-sm font-semibold">
                {markerName}
              </div>
            ) : (
              <button
                aria-label={`编辑 ${markerName} 名称`}
                aria-pressed={isNameEditing}
                className={cn(
                  "min-w-0 truncate bg-transparent p-0 text-left text-sm font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isNameEditing && "text-primary",
                )}
                onClick={onStartNameEditing}
                title="编辑名称"
                type="button"
              >
                {markerName}
              </button>
            )}
            {isNameEditing && (
              <Badge className="shrink-0" variant="secondary">
                编辑中
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {marker.address}
          </p>
        </div>
      </div>
    </section>
  );
}

function MarkerStyleGlyph({
  kind,
  color,
  locked = false,
  number = 1,
}: MarkerStyleGlyphProps) {
  const safeNumber = Math.max(1, Math.min(number, 99));
  const markerColor = color || "#2563eb";
  const isCircleBased =
    kind === "circle" || kind === "circle-star" || kind === "circle-number";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
      )}
      data-locked={locked ? "true" : "false"}
      style={{ borderColor: markerColor, color: markerColor }}
    >
      <span
        className={cn(
          "relative grid size-5 place-items-center overflow-hidden",
          kind === "star" && "marker-style-glyph-star",
          kind === "circle" && "rounded-full",
          kind === "circle-star" &&
            "rounded-full marker-style-glyph-circle-star",
          kind === "circle-number" &&
            "rounded-full text-[11px] font-bold leading-none text-background",
        )}
        style={isCircleBased ? { backgroundColor: markerColor } : undefined}
      >
        {kind === "circle-number" ? safeNumber : null}
      </span>
    </span>
  );
}

function MarkerColorPicker({
  color,
  disabled = false,
  onColorChange,
}: MarkerColorPickerProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>点位颜色</Label>
        {disabled && <Badge variant="outline">解锁后可改</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {markerColorOptions.map((option) => (
          <button
            aria-label={`点位颜色：${option.label}`}
            aria-pressed={(color || "#2563eb") === option.value}
            className={cn(
              "size-7 rounded-md border border-white shadow-sm transition hover:scale-105 disabled:pointer-events-none disabled:opacity-50",
              (color || "#2563eb") === option.value &&
                "ring-2 ring-ring ring-offset-2",
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

function MarkerRouteConnectionPanel({
  marker,
  markerNumberById,
  onCreateRouteConnection,
  routeConnectionCandidates,
}: MarkerRouteConnectionPanelProps) {
  return (
    <Card className="marker-route-panel border-border/90 bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
      <CardHeader className="gap-2 p-3 pb-2">
        <Badge className="w-fit gap-1.5" variant="secondary">
          <Route className="size-3" />
          线路规划
        </Badge>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{marker.name}</div>
          <div className="text-xs text-muted-foreground">
            可连接 {routeConnectionCandidates.length} 个点位
          </div>
        </div>
      </CardHeader>

      <CardContent className="marker-route-panel-content px-3 pb-3 pt-0">
        {routeConnectionCandidates.length > 0 ? (
          <div className="marker-route-candidates space-y-2">
            {routeConnectionCandidates.map((candidate, index) => (
              <Button
                className="marker-route-candidate h-auto w-full justify-start gap-3 px-3 py-2 text-left"
                key={candidate.id}
                onClick={() => onCreateRouteConnection(candidate.id)}
                variant="ghost"
              >
                <MarkerStyleGlyph
                  color={candidate.color}
                  kind={candidate.kind}
                  locked={candidate.locked}
                  number={markerNumberById[candidate.id] ?? index + 1}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {candidate.name}
                    </span>
                    <Badge className="shrink-0" variant="outline">
                      {kindLabels[candidate.kind]}
                    </Badge>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {candidate.address}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
            暂无可连接点位
          </div>
        )}
      </CardContent>
    </Card>
  );
}
