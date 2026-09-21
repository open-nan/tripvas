"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type Konva from "konva";
import { Minus, Plus } from "lucide-react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type SetStateAction,
} from "react";

import type {
  WhiteboardBrush,
  WhiteboardElement,
  WhiteboardImageElement,
  WhiteboardLineElement,
  WhiteboardTextElement,
  WhiteboardTextFontWeight,
  WhiteboardTool,
  WhiteboardWatermarkConfig,
} from "./map-editor-types";

type WhiteboardPointerEvent = Konva.KonvaEventObject<
  MouseEvent | TouchEvent
>;
type WhiteboardDragEvent = Konva.KonvaEventObject<DragEvent>;
type WhiteboardTransformEvent = Konva.KonvaEventObject<Event>;

/**
 * 单种笔触的默认绘制配置。
 */
type WhiteboardBrushStyle = {
  /** 默认透明度。 */
  opacity: number;
  /** 默认线条粗细。 */
  strokeWidth: number;
  /** Konva 线条张力，用于控制线条平滑程度。 */
  tension: number;
  /** 可选虚线配置，用于表现铅笔等轻微颗粒感。 */
  dash?: number[];
};

/**
 * 白板文字字体选项。
 */
type WhiteboardTextFontOption = {
  /** 字体所属分组，用于在下拉框里归类展示。 */
  group: string;
  /** 字体选项 id，用于 select 控件取值。 */
  id: string;
  /** 字体选项展示名称。 */
  label: string;
  /** 实际应用到 Konva 和 textarea 的 CSS font-family。 */
  family: string;
};

/**
 * 白板文字字重选项。
 */
type WhiteboardTextWeightOption = {
  /** 字重数值，直接应用到 textarea，并作为 Konva fontStyle 的 font-weight。 */
  id: WhiteboardTextFontWeight;
  /** 字重选项展示名称。 */
  label: string;
};

/**
 * Konva 白板层的组件接口。
 *
 * 白板层只持有临时交互状态，真正的白板对象由 MapEditor 传入并回写；
 * 对象坐标存为高德经纬度，组件渲染时再通过 window.map 投影成屏幕坐标。
 */
type WhiteboardLayerProps = {
  /** 当前选中的画笔笔触；新建线条时会写入线条对象，已画线条不受后续切换影响。 */
  activeBrush: WhiteboardBrush;
  /** 当前白板颜色，新建线条、文字和填充工具都会使用这个颜色。 */
  activeColor: string;
  /** 当前激活的白板工具，决定白板层是否接管鼠标事件以及如何处理点击。 */
  activeTool: WhiteboardTool;
  /** 当前地图编辑器里已经创建的全部白板对象。 */
  elements: WhiteboardElement[];
  /** 当前颜色变化回调，吸色工具会通过它同步右侧工具栏。 */
  onColorChange: (color: string) => void;
  /** 白板对象更新回调，支持直接替换或基于当前对象集合做函数式更新。 */
  onElementsChange: Dispatch<SetStateAction<WhiteboardElement[]>>;
  /** 白板水印设置，用于控制水印显示、大小和是否平铺。 */
  watermark: WhiteboardWatermarkConfig;
  /** 地图视野变化版本号；变化时会触发白板对象重新投影到屏幕坐标。 */
  viewportVersion: number;
};

/**
 * 白板图片节点的组件接口。
 *
 * 图片加载需要浏览器 Image 对象，所以单独拆成组件来使用 React hook。
 */
type WhiteboardImageNodeProps = {
  /** 是否允许在选择工具下拖动图片。 */
  draggable: boolean;
  /** 图片白板对象数据。 */
  element: WhiteboardImageElement;
  /** 图片当前投影后的屏幕坐标。 */
  position: NanMapContainerPoint;
  /** 拖动结束后回写新的地图锚点。 */
  onDragEnd: (
    element: WhiteboardImageElement,
    event: WhiteboardDragEvent,
  ) => void;
  /** 鼠标或触摸按下时处理选中或擦除。 */
  onPointerDown: (id: string, event: WhiteboardPointerEvent) => void;
  /** 缩放结束后回写新的尺寸和地图锚点。 */
  onTransformEnd: (
    element: WhiteboardImageElement,
    event: WhiteboardTransformEvent,
  ) => void;
};

const TEXT_FONT_OPTIONS: WhiteboardTextFontOption[] = [
  {
    family:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    group: "中文",
    id: "system",
    label: "系统默认",
  },
  {
    family:
      '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    group: "中文",
    id: "chinese-sans",
    label: "中文黑体",
  },
  {
    family:
      '"Songti SC", SimSun, "Noto Serif CJK SC", "Source Han Serif SC", serif',
    group: "中文",
    id: "songti",
    label: "中文宋体",
  },
  {
    family: '"Kaiti SC", KaiTi, "STKaiti", cursive',
    group: "中文",
    id: "kaiti",
    label: "中文楷体",
  },
  {
    family: 'FangSong, STFangsong, "仿宋", serif',
    group: "中文",
    id: "fangsong",
    label: "中文仿宋",
  },
  {
    family:
      '"Yuanti SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    group: "中文",
    id: "rounded-cn",
    label: "中文圆体",
  },
  {
    family: '"Xingkai SC", "STXingkai", "华文行楷", "Kaiti SC", cursive',
    group: "艺术中文",
    id: "xingkai",
    label: "行楷",
  },
  {
    family: '"STXinwei", "华文新魏", "Weibei SC", serif',
    group: "艺术中文",
    id: "xinwei",
    label: "新魏",
  },
  {
    family: '"Hannotate SC", "Hannotate TC", "HanziPen SC", cursive',
    group: "艺术中文",
    id: "hannotate",
    label: "手札",
  },
  {
    family: '"HanziPen SC", "HanziPen TC", "Kaiti SC", cursive',
    group: "艺术中文",
    id: "hanzipen",
    label: "翰字笔",
  },
  {
    family: '"Weibei SC", "Weibei TC", "STXinwei", serif',
    group: "艺术中文",
    id: "weibei",
    label: "魏碑",
  },
  {
    family: '"Libian SC", "Libian TC", "STLiti", serif',
    group: "艺术中文",
    id: "libian",
    label: "隶书",
  },
  {
    family: '"Baoli SC", "Baoli TC", "STXingkai", cursive',
    group: "艺术中文",
    id: "baoli",
    label: "报隶",
  },
  {
    family: "Arial, Helvetica, sans-serif",
    group: "西文",
    id: "arial",
    label: "Arial",
  },
  {
    family: "Helvetica, Arial, sans-serif",
    group: "西文",
    id: "helvetica",
    label: "Helvetica",
  },
  {
    family: 'Verdana, Geneva, sans-serif',
    group: "西文",
    id: "verdana",
    label: "Verdana",
  },
  {
    family: 'Tahoma, Geneva, sans-serif',
    group: "西文",
    id: "tahoma",
    label: "Tahoma",
  },
  {
    family: '"Trebuchet MS", Arial, sans-serif',
    group: "西文",
    id: "trebuchet",
    label: "Trebuchet",
  },
  {
    family: 'Georgia, "Times New Roman", serif',
    group: "西文",
    id: "georgia",
    label: "Georgia",
  },
  {
    family: '"Times New Roman", Times, serif',
    group: "西文",
    id: "times",
    label: "Times",
  },
  {
    family: 'Garamond, Georgia, serif',
    group: "西文",
    id: "garamond",
    label: "Garamond",
  },
  {
    family: 'Palatino, "Palatino Linotype", Georgia, serif',
    group: "西文",
    id: "palatino",
    label: "Palatino",
  },
  {
    family: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    group: "等宽",
    id: "sf-mono",
    label: "SF Mono",
  },
  {
    family: 'Menlo, Monaco, Consolas, monospace',
    group: "等宽",
    id: "menlo",
    label: "Menlo",
  },
  {
    family: 'Consolas, "Liberation Mono", monospace',
    group: "等宽",
    id: "consolas",
    label: "Consolas",
  },
  {
    family: '"Courier New", Courier, monospace',
    group: "等宽",
    id: "courier",
    label: "Courier",
  },
  {
    family: '"Kaiti SC", "STKaiti", cursive',
    group: "手写装饰",
    id: "hand",
    label: "手写中文",
  },
  {
    family: '"Marker Felt", "Comic Sans MS", cursive',
    group: "手写装饰",
    id: "marker",
    label: "马克笔",
  },
  {
    family: '"Chalkboard SE", "Comic Sans MS", cursive',
    group: "手写装饰",
    id: "chalkboard",
    label: "粉笔",
  },
  {
    family: '"Bradley Hand", "Comic Sans MS", cursive',
    group: "手写装饰",
    id: "bradley",
    label: "手写英文",
  },
  {
    family: '"Apple Chancery", "Snell Roundhand", cursive',
    group: "艺术西文",
    id: "chancery",
    label: "Chancery",
  },
  {
    family: '"Snell Roundhand", "Brush Script MT", cursive',
    group: "艺术西文",
    id: "snell",
    label: "Snell",
  },
  {
    family: 'Papyrus, fantasy',
    group: "艺术西文",
    id: "papyrus",
    label: "Papyrus",
  },
  {
    family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    group: "艺术西文",
    id: "impact",
    label: "Impact",
  },
  {
    family: 'Copperplate, "Copperplate Gothic Light", fantasy',
    group: "艺术西文",
    id: "copperplate",
    label: "Copperplate",
  },
  {
    family: 'Didot, Bodoni 72, "Bodoni MT", serif',
    group: "艺术西文",
    id: "didot",
    label: "Didot",
  },
  {
    family: '"Zapfino", "Apple Chancery", cursive',
    group: "艺术西文",
    id: "zapfino",
    label: "Zapfino",
  },
];
const TEXT_FONT_GROUPS = Array.from(
  new Set(TEXT_FONT_OPTIONS.map((option) => option.group)),
);
const TEXT_FONT_WEIGHT_OPTIONS: WhiteboardTextWeightOption[] = [
  { id: 300, label: "细" },
  { id: 400, label: "常规" },
  { id: 500, label: "中等" },
  { id: 600, label: "半粗" },
  { id: 700, label: "粗体" },
  { id: 800, label: "特粗" },
  { id: 900, label: "黑体" },
];
const DEFAULT_TEXT_FONT_FAMILY = TEXT_FONT_OPTIONS[0].family;
const DEFAULT_TEXT_FONT_WEIGHT: WhiteboardTextFontWeight = 400;
const DEFAULT_TEXT_WIDTH = 180;
const DEFAULT_TEXT_FONT_SIZE = 18;
const MAX_TEXT_FONT_SIZE = 72;
const DEFAULT_IMAGE_WIDTH = 220;
const DEFAULT_IMAGE_HEIGHT = 160;
const MIN_IMAGE_SIZE = 48;
const MIN_TEXT_WIDTH = 80;
const MIN_TEXT_FONT_SIZE = 12;
const PHOTO_BUBBLE_PADDING = 6;
const WHITEBOARD_BRUSH_STYLES: Record<WhiteboardBrush, WhiteboardBrushStyle> = {
  crayon: {
    opacity: 0.42,
    strokeWidth: 9,
    tension: 0.16,
  },
  fountain: {
    opacity: 0.92,
    strokeWidth: 4,
    tension: 0.28,
  },
  pencil: {
    dash: [2, 3],
    opacity: 0.72,
    strokeWidth: 2,
    tension: 0.08,
  },
};
const CRAYON_STROKE_OFFSETS = [
  { opacity: 0.42, strokeWidthOffset: 0, x: 0, y: 0 },
  { opacity: 0.24, strokeWidthOffset: -2, x: -1.2, y: 0.8 },
  { opacity: 0.2, strokeWidthOffset: -3, x: 1.4, y: -0.9 },
];

function createWhiteboardElementId(kind: WhiteboardElement["kind"]) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFittedImageSize(naturalWidth: number, naturalHeight: number) {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return {
      height: DEFAULT_IMAGE_HEIGHT,
      width: DEFAULT_IMAGE_WIDTH,
    };
  }

  const fitRatio = Math.min(
    DEFAULT_IMAGE_WIDTH / naturalWidth,
    DEFAULT_IMAGE_HEIGHT / naturalHeight,
    1,
  );

  return {
    height: Math.max(MIN_IMAGE_SIZE, Math.round(naturalHeight * fitRatio)),
    width: Math.max(MIN_IMAGE_SIZE, Math.round(naturalWidth * fitRatio)),
  };
}

function shouldAppendPoint(points: NanMapLngLat[], nextPoint: NanMapLngLat) {
  const lastPoint = points[points.length - 1];

  if (!lastPoint) {
    return true;
  }

  return (
    Math.abs(lastPoint[0] - nextPoint[0]) > 0.000001 ||
    Math.abs(lastPoint[1] - nextPoint[1]) > 0.000001
  );
}

function getBrushStyle(brush: WhiteboardBrush) {
  return WHITEBOARD_BRUSH_STYLES[brush];
}

function getWhiteboardElementColor(element: WhiteboardElement) {
  if (element.kind === "image") {
    return null;
  }

  return element.color;
}

function getTextFontFamily(fontFamily?: string) {
  return fontFamily || DEFAULT_TEXT_FONT_FAMILY;
}

function getTextFontWeight(fontWeight?: WhiteboardTextFontWeight) {
  return fontWeight ?? DEFAULT_TEXT_FONT_WEIGHT;
}

function getKonvaTextFontStyle(fontWeight?: WhiteboardTextFontWeight) {
  return `${getTextFontWeight(fontWeight)}`;
}

function getNormalizedFontFamily(fontFamily?: string) {
  return (fontFamily ?? "")
    .toLowerCase()
    .replaceAll("'", '"')
    .replace(/\s+/g, "");
}

function getTextFontOptionId(fontFamily?: string) {
  const normalizedFontFamily = getNormalizedFontFamily(fontFamily);

  return (
    TEXT_FONT_OPTIONS.find(
      (option) => getNormalizedFontFamily(option.family) === normalizedFontFamily,
    )?.id ??
    TEXT_FONT_OPTIONS[0].id
  );
}

function getTextFontFamilyByOptionId(optionId: string) {
  return (
    TEXT_FONT_OPTIONS.find((option) => option.id === optionId)?.family ??
    DEFAULT_TEXT_FONT_FAMILY
  );
}

function getClampedTextFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TEXT_FONT_SIZE;
  }

  return Math.max(
    MIN_TEXT_FONT_SIZE,
    Math.min(MAX_TEXT_FONT_SIZE, Math.round(value)),
  );
}

function getTextFontWeightByOptionValue(value: string) {
  const nextWeight = Number(value);

  return (
    TEXT_FONT_WEIGHT_OPTIONS.find((option) => option.id === nextWeight)?.id ??
    DEFAULT_TEXT_FONT_WEIGHT
  );
}

function getOffsetLinePoints(
  points: number[],
  offsetX: number,
  offsetY: number,
) {
  return points.map((point, index) =>
    index % 2 === 0 ? point + offsetX : point + offsetY,
  );
}

function WhiteboardImageNode({
  draggable,
  element,
  position,
  onDragEnd,
  onPointerDown,
  onTransformEnd,
}: WhiteboardImageNodeProps) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const nextImage = new window.Image();

    nextImage.onload = () => {
      if (!cancelled) {
        setImageElement(nextImage);
      }
    };
    nextImage.src = element.src;

    return () => {
      cancelled = true;
    };
  }, [element.src]);

  return (
    <Group
      draggable={draggable}
      id={element.id}
      listening
      opacity={element.opacity}
      x={position[0]}
      y={position[1]}
      onDragEnd={(event) => onDragEnd(element, event)}
      onMouseDown={(event) => onPointerDown(element.id, event)}
      onTap={(event) => onPointerDown(element.id, event)}
      onTouchStart={(event) => onPointerDown(element.id, event)}
      onTransformEnd={(event) => onTransformEnd(element, event)}
    >
      <Rect
        cornerRadius={16}
        fill="#ffffff"
        height={element.height + PHOTO_BUBBLE_PADDING * 2}
        shadowBlur={10}
        shadowColor="rgba(17, 24, 21, 0.2)"
        shadowOffsetY={4}
        width={element.width + PHOTO_BUBBLE_PADDING * 2}
        x={-PHOTO_BUBBLE_PADDING}
        y={-PHOTO_BUBBLE_PADDING}
      />
      <KonvaImage
        cornerRadius={12}
        height={element.height}
        image={imageElement ?? undefined}
        perfectDrawEnabled={false}
        width={element.width}
      />
    </Group>
  );
}

export function WhiteboardLayer({
  activeBrush,
  activeColor,
  activeTool,
  elements,
  onColorChange,
  onElementsChange,
  watermark,
  viewportVersion,
}: WhiteboardLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageAnchorRef = useRef<NanMapLngLat | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const textDragEditSuppressionRef = useRef<string | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const activeLineIdRef = useRef<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [size, setSize] = useState({ height: 0, width: 0 });
  const isWhiteboardInteractive = activeTool !== "move";
  const isSelectionMode = activeTool === "select";
  const canDragText = isSelectionMode || activeTool === "text";

  const projectLngLat = useCallback((lngLat: NanMapLngLat) => {
    return window.map?.lngLatToContainer?.(lngLat) ?? null;
  }, []);

  const getPointerLngLat = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return window.map?.containerToLngLat?.([pointer.x, pointer.y]) ?? null;
  }, []);

  const getFallbackImageAnchor = useCallback(() => {
    return (
      pendingImageAnchorRef.current ??
      window.map?.containerToLngLat?.([size.width / 2, size.height / 2]) ??
      null
    );
  }, [size.height, size.width]);

  const updateElement = useCallback(
    (
      elementId: string,
      updater: (element: WhiteboardElement) => WhiteboardElement,
    ) => {
      onElementsChange((currentElements) =>
        currentElements.map((element) =>
          element.id === elementId ? updater(element) : element,
        ),
      );
    },
    [onElementsChange],
  );

  const removeElement = useCallback(
    (elementId: string) => {
      onElementsChange((currentElements) =>
        currentElements.filter((element) => element.id !== elementId),
      );
      setSelectedElementId((currentId) =>
        currentId === elementId ? null : currentId,
      );
    },
    [onElementsChange],
  );

  const startLineAtPointer = useCallback(() => {
    const lngLat = getPointerLngLat();

    if (!lngLat) {
      return false;
    }

    const brushStyle = getBrushStyle(activeBrush);
    const nextLine: WhiteboardLineElement = {
      brush: activeBrush,
      color: activeColor,
      id: createWhiteboardElementId("line"),
      kind: "line",
      opacity: brushStyle.opacity,
      points: [lngLat],
      strokeWidth: brushStyle.strokeWidth,
    };

    activeLineIdRef.current = nextLine.id;
    setSelectedElementId(nextLine.id);
    onElementsChange((currentElements) => [...currentElements, nextLine]);

    return true;
  }, [activeBrush, activeColor, getPointerLngLat, onElementsChange]);

  const handleElementPointerDown = useCallback(
    (elementId: string, event: WhiteboardPointerEvent) => {
      event.cancelBubble = true;

      if (activeTool === "pen") {
        event.evt.preventDefault();
        startLineAtPointer();
        return;
      }

      if (activeTool === "erase") {
        removeElement(elementId);
        return;
      }

      if (activeTool === "eyedropper") {
        const targetElement =
          elements.find((element) => element.id === elementId) ?? null;
        const color = targetElement
          ? getWhiteboardElementColor(targetElement)
          : null;

        if (color) {
          onColorChange(color);
          setSelectedElementId(elementId);
        }
        return;
      }

      if (activeTool === "bucket") {
        updateElement(elementId, (currentElement) =>
          currentElement.kind === "line" || currentElement.kind === "text"
            ? { ...currentElement, color: activeColor }
            : currentElement,
        );
        setSelectedElementId(elementId);
        return;
      }

      if (activeTool === "select") {
        setSelectedElementId(elementId);
      }
    },
    [
      activeColor,
      activeTool,
      elements,
      onColorChange,
      removeElement,
      startLineAtPointer,
      updateElement,
    ],
  );

  const handleStagePointerDown = useCallback(
    (event: WhiteboardPointerEvent) => {
      const stage = event.target.getStage();

      if (event.target !== stage) {
        return;
      }

      if (activeTool !== "select") {
        event.evt.preventDefault();
      }

      if (activeTool === "select") {
        setSelectedElementId(null);
        return;
      }

      if (activeTool === "pen") {
        startLineAtPointer();
        return;
      }

      const lngLat = getPointerLngLat();

      if (!lngLat) {
        return;
      }

      if (activeTool === "text") {
        const nextText: WhiteboardTextElement = {
          anchor: lngLat,
          color: activeColor,
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          fontWeight: DEFAULT_TEXT_FONT_WEIGHT,
          fontSize: DEFAULT_TEXT_FONT_SIZE,
          id: createWhiteboardElementId("text"),
          kind: "text",
          text: "新文字",
          width: DEFAULT_TEXT_WIDTH,
        };

        setSelectedElementId(nextText.id);
        onElementsChange((currentElements) => [
          ...currentElements,
          nextText,
        ]);
        return;
      }

      if (activeTool === "image") {
        pendingImageAnchorRef.current = lngLat;
        fileInputRef.current?.click();
      }
    },
    [
      activeColor,
      activeTool,
      getPointerLngLat,
      onElementsChange,
      startLineAtPointer,
    ],
  );

  const handleStagePointerMove = useCallback(() => {
    if (activeTool !== "pen" || !activeLineIdRef.current) {
      return;
    }

    const lngLat = getPointerLngLat();
    const activeLineId = activeLineIdRef.current;

    if (!lngLat) {
      return;
    }

    onElementsChange((currentElements) =>
      currentElements.map((element) => {
        if (element.id !== activeLineId || element.kind !== "line") {
          return element;
        }

        if (!shouldAppendPoint(element.points, lngLat)) {
          return element;
        }

        return {
          ...element,
          points: [...element.points, lngLat],
        };
      }),
    );
  }, [activeTool, getPointerLngLat, onElementsChange]);

  const handleFinishLine = useCallback(() => {
    const activeLineId = activeLineIdRef.current;

    activeLineIdRef.current = null;

    if (!activeLineId) {
      return;
    }

    onElementsChange((currentElements) =>
      currentElements.filter(
        (element) =>
          element.id !== activeLineId ||
          element.kind !== "line" ||
          element.points.length > 1,
      ),
    );
    setSelectedElementId((currentId) =>
      currentId === activeLineId ? null : currentId,
    );
  }, [onElementsChange]);

  const handleImageFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";

      if (!file) {
        pendingImageAnchorRef.current = null;
        return;
      }

      const anchor = getFallbackImageAnchor();

      if (!anchor) {
        pendingImageAnchorRef.current = null;
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";

        if (!src) {
          pendingImageAnchorRef.current = null;
          return;
        }

        const previewImage = new window.Image();

        previewImage.onload = () => {
          const imageSize = getFittedImageSize(
            previewImage.naturalWidth,
            previewImage.naturalHeight,
          );
          const nextImage: WhiteboardImageElement = {
            anchor,
            height: imageSize.height,
            id: createWhiteboardElementId("image"),
            kind: "image",
            opacity: 0.94,
            src,
            width: imageSize.width,
          };

          setSelectedElementId(nextImage.id);
          onElementsChange((currentElements) => [
            ...currentElements,
            nextImage,
          ]);
          pendingImageAnchorRef.current = null;
        };

        previewImage.src = src;
      };

      reader.readAsDataURL(file);
    },
    [getFallbackImageAnchor, onElementsChange],
  );

  const handleLineDragEnd = useCallback(
    (element: WhiteboardLineElement, event: WhiteboardDragEvent) => {
      const node = event.currentTarget;
      const deltaX = node.x();
      const deltaY = node.y();

      node.position({ x: 0, y: 0 });

      if (!deltaX && !deltaY) {
        return;
      }

      const nextPoints = element.points.map((lngLat) => {
        const point = projectLngLat(lngLat);

        if (!point) {
          return lngLat;
        }

        return (
          window.map?.containerToLngLat?.([
            point[0] + deltaX,
            point[1] + deltaY,
          ]) ?? lngLat
        );
      });

      updateElement(element.id, (currentElement) =>
        currentElement.kind === "line"
          ? { ...currentElement, points: nextPoints }
          : currentElement,
      );
    },
    [projectLngLat, updateElement],
  );

  const handleNodeDragEnd = useCallback(
    (
      element: WhiteboardImageElement | WhiteboardTextElement,
      event: WhiteboardDragEvent,
    ) => {
      const node = event.target;
      const anchor = window.map?.containerToLngLat?.([node.x(), node.y()]);

      if (!anchor) {
        return;
      }

      updateElement(element.id, (currentElement) =>
        currentElement.kind === element.kind
          ? { ...currentElement, anchor }
          : currentElement,
      );
    },
    [updateElement],
  );

  const startEditingText = useCallback(
    (element: WhiteboardTextElement, event: WhiteboardPointerEvent) => {
      event.cancelBubble = true;

      if (activeTool !== "select" && activeTool !== "text") {
        return;
      }

      if (textDragEditSuppressionRef.current === element.id) {
        return;
      }

      setSelectedElementId(element.id);
      setEditingTextId(element.id);
      setEditingTextValue(element.text);
    },
    [activeTool],
  );

  const cancelEditingText = useCallback(() => {
    setEditingTextId(null);
    setEditingTextValue("");
  }, []);

  const commitEditingText = useCallback(() => {
    const currentEditingTextId = editingTextId;
    const nextText = editingTextValue.trim();

    if (!currentEditingTextId) {
      return;
    }

    if (nextText) {
      updateElement(currentEditingTextId, (currentElement) =>
        currentElement.kind === "text"
          ? { ...currentElement, text: nextText }
          : currentElement,
      );
    }

    setEditingTextId(null);
    setEditingTextValue("");
  }, [editingTextId, editingTextValue, updateElement]);

  const updateEditingTextStyle = useCallback(
    (
      updates: Partial<
        Pick<
          WhiteboardTextElement,
          "color" | "fontFamily" | "fontSize" | "fontWeight"
        >
      >,
    ) => {
      const currentEditingTextId = editingTextId;

      if (!currentEditingTextId) {
        return;
      }

      if (updates.color) {
        onColorChange(updates.color);
      }

      updateElement(currentEditingTextId, (currentElement) =>
        currentElement.kind === "text"
          ? {
              ...currentElement,
              ...updates,
            }
          : currentElement,
      );
    },
    [editingTextId, onColorChange, updateElement],
  );

  const handleTextEditOverlayBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextFocusedElement = event.relatedTarget;

      if (
        nextFocusedElement instanceof Node &&
        event.currentTarget.contains(nextFocusedElement)
      ) {
        return;
      }

      commitEditingText();
    },
    [commitEditingText],
  );

  const handleTextPointerDown = useCallback(
    (elementId: string, event: WhiteboardPointerEvent) => {
      if (activeTool === "text") {
        event.cancelBubble = true;
        setSelectedElementId(elementId);
        return;
      }

      handleElementPointerDown(elementId, event);
    },
    [activeTool, handleElementPointerDown],
  );

  const handleTextDragStart = useCallback(
    (elementId: string, event: WhiteboardDragEvent) => {
      event.cancelBubble = true;
      textDragEditSuppressionRef.current = elementId;
      cancelEditingText();
    },
    [cancelEditingText],
  );

  const handleTextDragEnd = useCallback(
    (element: WhiteboardTextElement, event: WhiteboardDragEvent) => {
      event.cancelBubble = true;
      handleNodeDragEnd(element, event);

      window.setTimeout(() => {
        if (textDragEditSuppressionRef.current === element.id) {
          textDragEditSuppressionRef.current = null;
        }
      }, 0);
    },
    [handleNodeDragEnd],
  );

  const handleTextTransformEnd = useCallback(
    (element: WhiteboardTextElement, event: WhiteboardTransformEvent) => {
      const node = event.target as Konva.Text;
      const anchor = window.map?.containerToLngLat?.([node.x(), node.y()]);
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const nextWidth = Math.max(
        MIN_TEXT_WIDTH,
        Math.round(node.width() * scaleX),
      );
      const nextFontSize = Math.max(
        MIN_TEXT_FONT_SIZE,
        Math.round(element.fontSize * scaleY),
      );

      node.scale({ x: 1, y: 1 });

      if (!anchor) {
        return;
      }

      updateElement(element.id, (currentElement) =>
        currentElement.kind === "text"
          ? {
              ...currentElement,
              anchor,
              fontSize: nextFontSize,
              width: nextWidth,
            }
          : currentElement,
      );
    },
    [updateElement],
  );

  const handleImageTransformEnd = useCallback(
    (element: WhiteboardImageElement, event: WhiteboardTransformEvent) => {
      const node = event.target as Konva.Group;
      const anchor = window.map?.containerToLngLat?.([node.x(), node.y()]);
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const nextWidth = Math.max(
        MIN_IMAGE_SIZE,
        Math.round(element.width * scaleX),
      );
      const nextHeight = Math.max(
        MIN_IMAGE_SIZE,
        Math.round(element.height * scaleY),
      );

      node.scale({ x: 1, y: 1 });

      if (!anchor) {
        return;
      }

      updateElement(element.id, (currentElement) =>
        currentElement.kind === "image"
          ? {
              ...currentElement,
              anchor,
              height: nextHeight,
              width: nextWidth,
            }
          : currentElement,
      );
    },
    [updateElement],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize((currentSize) => {
        const nextSize = {
          height: container.clientHeight,
          width: container.clientWidth,
        };

        return currentSize.height === nextSize.height &&
          currentSize.width === nextSize.width
          ? currentSize
          : nextSize;
      });
    };
    const observer = new ResizeObserver(updateSize);

    updateSize();
    observer.observe(container);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    if (!editingTextId) {
      return;
    }

    textEditorRef.current?.focus();
    textEditorRef.current?.select();
  }, [editingTextId]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    const selectedElement =
      elements.find((element) => element.id === selectedElementId) ?? null;

    if (
      editingTextId ||
      !transformer ||
      !stage ||
      !selectedElement ||
      selectedElement.kind === "line"
    ) {
      transformer?.nodes([]);
      transformer?.getLayer()?.batchDraw();
      return;
    }

    const selectedNode = stage.findOne(`#${selectedElement.id}`);

    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [editingTextId, elements, selectedElementId, viewportVersion]);

  const watermarkText = watermark.text.trim();
  const watermarkTiles: Array<{ id: string; x: number; y: number }> = [];

  if (watermark.enabled && watermarkText && size.width > 0 && size.height > 0) {
    const watermarkWidth = Math.max(
      120,
      Math.round(watermarkText.length * watermark.size * 0.72),
    );

    if (watermark.tiled) {
      const horizontalStep = Math.max(watermarkWidth + 48, watermark.spacing);
      const verticalStep = Math.max(96, Math.round(watermark.spacing * 0.62));

      for (
        let y = -verticalStep;
        y < size.height + verticalStep;
        y += verticalStep
      ) {
        for (
          let x = -horizontalStep;
          x < size.width + horizontalStep;
          x += horizontalStep
        ) {
          watermarkTiles.push({
            id: `${x}:${y}`,
            x,
            y,
          });
        }
      }
    } else {
      watermarkTiles.push({
        id: "single",
        x: Math.max(24, size.width - watermarkWidth - 56),
        y: Math.max(36, size.height - watermark.size * 2.4 - 48),
      });
    }
  }

  const editingTextElement =
    elements.find(
      (element): element is WhiteboardTextElement =>
        element.kind === "text" && element.id === editingTextId,
    ) ?? null;
  const editingTextPosition = editingTextElement
    ? projectLngLat(editingTextElement.anchor)
    : null;

  return (
    <div
      aria-hidden={!isWhiteboardInteractive}
      className={cn(
        "whiteboard-layer",
        isWhiteboardInteractive && "whiteboard-layer-interactive",
        activeTool === "select" && "whiteboard-layer-select",
        activeTool === "pen" && "whiteboard-layer-pen",
        activeTool === "text" && "whiteboard-layer-text",
        activeTool === "image" && "whiteboard-layer-image",
        activeTool === "eyedropper" && "whiteboard-layer-eyedropper",
        activeTool === "bucket" && "whiteboard-layer-bucket",
        activeTool === "erase" && "whiteboard-layer-erase",
      )}
      ref={containerRef}
    >
      <input
        accept="image/*"
        aria-hidden="true"
        className="sr-only"
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
        onChange={handleImageFileChange}
      />
      <Stage
        height={size.height}
        ref={stageRef}
        width={size.width}
        onMouseDown={handleStagePointerDown}
        onMouseLeave={handleFinishLine}
        onMouseMove={handleStagePointerMove}
        onMouseUp={handleFinishLine}
        onTouchEnd={handleFinishLine}
        onTouchMove={handleStagePointerMove}
        onTouchStart={handleStagePointerDown}
      >
        {watermarkTiles.length > 0 && (
          <Layer listening={false}>
            {watermarkTiles.map((tile) => (
              <Text
                fill="#111815"
                fontFamily="Arial, Helvetica, sans-serif"
                fontSize={watermark.size}
                fontStyle="bold"
                key={tile.id}
                opacity={watermark.opacity}
                rotation={-24}
                text={watermarkText}
                x={tile.x}
                y={tile.y}
              />
            ))}
          </Layer>
        )}
        <Layer>
          {elements.map((element) => {
            if (element.kind === "line") {
              const brush = element.brush ?? "fountain";
              const brushStyle = getBrushStyle(brush);
              const isSelected = selectedElementId === element.id;
              const points = element.points.reduce<number[]>(
                (projectedPoints, lngLat) => {
                  const point = projectLngLat(lngLat);

                  if (point) {
                    projectedPoints.push(point[0], point[1]);
                  }

                  return projectedPoints;
                },
                [],
              );

              if (points.length < 4) {
                return null;
              }

              return (
                <Group
                  draggable={isSelectionMode}
                  id={element.id}
                  key={element.id}
                  listening
                  onClick={(event) =>
                    handleElementPointerDown(element.id, event)
                  }
                  onDragEnd={(event) => handleLineDragEnd(element, event)}
                  onMouseDown={(event) =>
                    handleElementPointerDown(element.id, event)
                  }
                  onTap={(event) => handleElementPointerDown(element.id, event)}
                  onTouchStart={(event) =>
                    handleElementPointerDown(element.id, event)
                  }
                >
                  {isSelected && (
                    <Line
                      hitStrokeWidth={activeTool === "erase" ? 18 : 12}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      opacity={0.18}
                      points={points}
                      stroke="#0f766e"
                      strokeScaleEnabled={false}
                      strokeWidth={element.strokeWidth + 9}
                      tension={brushStyle.tension}
                    />
                  )}

                  {brush === "crayon" ? (
                    CRAYON_STROKE_OFFSETS.map((offset) => (
                      <Line
                        hitStrokeWidth={activeTool === "erase" ? 20 : 14}
                        key={`${element.id}-${offset.x}-${offset.y}`}
                        lineCap="round"
                        lineJoin="round"
                        listening={offset.x === 0 && offset.y === 0}
                        opacity={offset.opacity}
                        points={getOffsetLinePoints(
                          points,
                          offset.x,
                          offset.y,
                        )}
                        shadowBlur={isSelected ? 5 : 0}
                        shadowColor="rgba(217, 119, 6, 0.35)"
                        shadowEnabled={isSelected}
                        stroke={element.color}
                        strokeScaleEnabled={false}
                        strokeWidth={Math.max(
                          2,
                          element.strokeWidth + offset.strokeWidthOffset,
                        )}
                        tension={brushStyle.tension}
                      />
                    ))
                  ) : (
                    <Line
                      dash={brushStyle.dash}
                      hitStrokeWidth={activeTool === "erase" ? 18 : 12}
                      lineCap="round"
                      lineJoin="round"
                      listening
                      opacity={element.opacity}
                      points={points}
                      shadowBlur={isSelected ? 8 : 0}
                      shadowColor="rgba(15, 118, 110, 0.55)"
                      shadowEnabled={isSelected}
                      shadowForStrokeEnabled={false}
                      stroke={element.color}
                      strokeScaleEnabled={false}
                      strokeWidth={element.strokeWidth}
                      tension={brushStyle.tension}
                    />
                  )}
                </Group>
              );
            }

            if (element.kind === "text") {
              const position = projectLngLat(element.anchor);

              if (!position) {
                return null;
              }

              return (
                <Text
                  draggable={canDragText}
                  fill={element.color}
                  fontFamily={getTextFontFamily(element.fontFamily)}
                  fontStyle={getKonvaTextFontStyle(element.fontWeight)}
                  fontSize={element.fontSize}
                  id={element.id}
                  key={element.id}
                  lineHeight={1.28}
                  listening
                  padding={6}
                  text={element.text}
                  visible={editingTextId !== element.id}
                  width={element.width}
                  x={position[0]}
                  y={position[1]}
                  onClick={(event) => startEditingText(element, event)}
                  onDragEnd={(event) => handleTextDragEnd(element, event)}
                  onDragStart={(event) =>
                    handleTextDragStart(element.id, event)
                  }
                  onMouseDown={(event) =>
                    handleTextPointerDown(element.id, event)
                  }
                  onTap={(event) => startEditingText(element, event)}
                  onTouchStart={(event) =>
                    handleTextPointerDown(element.id, event)
                  }
                  onTransformEnd={(event) =>
                    handleTextTransformEnd(element, event)
                  }
                />
              );
            }

            const position = projectLngLat(element.anchor);

            if (!position) {
              return null;
            }

            return (
              <WhiteboardImageNode
                draggable={isSelectionMode}
                element={element}
                key={element.id}
                position={position}
                onDragEnd={handleNodeDragEnd}
                onPointerDown={handleElementPointerDown}
                onTransformEnd={handleImageTransformEnd}
              />
            );
          })}

          {isSelectionMode && !editingTextElement && (
            <Transformer
              borderDash={[4, 4]}
              borderStroke="#0f766e"
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
              ]}
              flipEnabled={false}
              ignoreStroke
              keepRatio={false}
              ref={transformerRef}
              rotateEnabled={false}
            />
          )}
        </Layer>
      </Stage>
      {editingTextElement && editingTextPosition && (
        <div
          className="whiteboard-text-edit-overlay"
          style={{
            left: editingTextPosition[0],
            top: editingTextPosition[1],
            width: editingTextElement.width,
          }}
          onBlurCapture={handleTextEditOverlayBlur}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <div className="whiteboard-text-toolbar">
            <select
              aria-label="文字字体"
              className="whiteboard-text-font-select"
              value={getTextFontOptionId(editingTextElement.fontFamily)}
              onChange={(event) =>
                updateEditingTextStyle({
                  fontFamily: getTextFontFamilyByOptionId(event.target.value),
                })
              }
            >
              {TEXT_FONT_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {TEXT_FONT_OPTIONS.filter(
                    (option) => option.group === group,
                  ).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <select
              aria-label="文字粗细"
              className="whiteboard-text-weight-select"
              value={getTextFontWeight(editingTextElement.fontWeight)}
              onChange={(event) =>
                updateEditingTextStyle({
                  fontWeight: getTextFontWeightByOptionValue(
                    event.target.value,
                  ),
                })
              }
            >
              {TEXT_FONT_WEIGHT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="whiteboard-text-size-group">
              <Button
                aria-label="减小文字"
                className="size-8"
                size="icon"
                title="减小文字"
                type="button"
                variant="ghost"
                onClick={() =>
                  updateEditingTextStyle({
                    fontSize: getClampedTextFontSize(
                      editingTextElement.fontSize - 2,
                    ),
                  })
                }
              >
                <Minus className="size-4" />
              </Button>
              <input
                aria-label="文字大小"
                className="whiteboard-text-size-input"
                max={MAX_TEXT_FONT_SIZE}
                min={MIN_TEXT_FONT_SIZE}
                type="number"
                value={editingTextElement.fontSize}
                onChange={(event) =>
                  updateEditingTextStyle({
                    fontSize: getClampedTextFontSize(
                      Number(event.target.value),
                    ),
                  })
                }
              />
              <Button
                aria-label="放大文字"
                className="size-8"
                size="icon"
                title="放大文字"
                type="button"
                variant="ghost"
                onClick={() =>
                  updateEditingTextStyle({
                    fontSize: getClampedTextFontSize(
                      editingTextElement.fontSize + 2,
                    ),
                  })
                }
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <textarea
            aria-label="编辑白板文字"
            className="whiteboard-text-editor"
            ref={textEditorRef}
            spellCheck={false}
            style={{
              color: editingTextElement.color,
              fontFamily: getTextFontFamily(editingTextElement.fontFamily),
              fontWeight: getTextFontWeight(editingTextElement.fontWeight),
              fontSize: editingTextElement.fontSize,
              height: Math.max(44, editingTextElement.fontSize * 2.4),
              lineHeight: 1.28,
            }}
            value={editingTextValue}
            onChange={(event) => setEditingTextValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditingText();
                return;
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitEditingText();
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
