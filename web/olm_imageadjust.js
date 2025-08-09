import { app } from "../../scripts/app.js";
import { ChannelSliderWidget } from "./channelslider_widget.js";

const DEFAULT_ADJUST_VALUES = {
  exposure: 0.0,
  brightness: 1.0,
  contrast: 1.0,
  gamma: 1.0,
  shadows: 0.0,
  midtones: 1.0,
  highlights: 1.0,
  hue: 0.0,
  saturation: 1.0,
  value: 1.0,
  vibrance: 1.0,
};

function removeInputs(node, filter) {
  if (
    !node ||
    node.type !== "OlmImageAdjust" ||
    node.id === -1 ||
    !Array.isArray(node.inputs)
  )
    return;
  for (let i = node.inputs.length - 1; i >= 0; i--) {
    if (filter(node.inputs[i])) {
      node.removeInput(i);
    }
  }
}

function hideWidget(widget, extraYOffset = -4) {
  if (widget) {
    widget.hidden = true;
    widget.computeSize = () => [0, extraYOffset];
  }
}

function initAdjustProperties(node) {
  node.properties = node.properties || {};
  if (!node.properties.adjust_values) {
    node.properties.adjust_values = JSON.parse(
      JSON.stringify(DEFAULT_ADJUST_VALUES)
    );
  }
}

function createChannelSlider(
  node,
  key,
  label,
  min,
  max,
  color,
  gradientColors,
  unit,
  updateAdjustProperty
) {
  return new ChannelSliderWidget(
    node,
    `slider_${key}`,
    node.properties.adjust_values[key],
    (v) => {
      updateAdjustProperty(key, v);
      node.requestPreviewUpdate();
    },
    {
      label,
      min,
      max,
      ...(color && { color }),
      ...(gradientColors && { gradientColors }),
      unit,
    }
  );
}

function updateHiddenWidget(node, key, value) {
  const widget = node.getWidget(key);
  if (widget) {
    node.setWidgetValue(key, value);
  }
}

function updateAdjustProperty(node, key, value) {
  node.properties.adjust_values[key] = value;
  updateHiddenWidget(node, key, value);
}

function createPreviewUpdateFunction(node) {
  let debounceTimer = null;
  return () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!node.previewCacheKey) {
        console.warn(
          "[OlmImageAdjust] No cached image available. Please run the node first."
        );
        return;
      }

      fetch(
        `/olm/api/imageadjust/update?key=${encodeURIComponent(
          node.previewCacheKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...node.properties.adjust_values }),
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "success" && data.updatedimage) {
            const img = new Image();
            img.onload = () => {
              node._previewImage = img;
              node.setDirtyCanvas(true, true);
            };
            img.src = data.updatedimage;
          }
        })
        .catch((err) => console.warn("Preview update failed", err));
    }, 100);
  };
}

app.registerExtension({
  name: "olm.color.imageadjust",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== "OlmImageAdjust") return;

    nodeType.prototype.getWidget = function (name) {
      return this.widgets.find((w) => w.name === name);
    };

    nodeType.prototype.getWidgetValue = function (name, fallback = null) {
      return this.widgets.find((w) => w.name === name)?.value || fallback;
    };

    nodeType.prototype.setWidgetValue = function (widgetName, val) {
      const widget = this.getWidget(widgetName);
      if (widget && val !== null && val !== undefined) {
        widget.value = val;
      }
    };

    nodeType.prototype.resizable = true;

    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
    const originalOnConfigure = nodeType.prototype.onConfigure;
    const onExecutedOriginal = nodeType.prototype.onExecuted;

    nodeType.prototype.onNodeCreated = function () {
      originalOnNodeCreated?.call(this);

      initAdjustProperties(this);

      hideWidget(this.getWidget("version"), 300);

      for (let i = this.widgets.length - 1; i >= 0; i--) {
        const widget = this.widgets[i];
        if (widget.type === "number" || widget.type === "slider") {
          hideWidget(widget, 0);
        }
      }

      this.custom_widgets = [];

      const updateAdjust = (key, val) => updateAdjustProperty(this, key, val);

      const slidersConfig = [
        {
          key: "exposure",
          label: "Exposure",
          min: -4.0,
          max: 4.0,
          gradientColors: ["#000000", "#ffffff"],
          unit: "%",
        },
        {
          key: "brightness",
          label: "Brightness",
          min: 0.0,
          max: 2.0,
          gradientColors: ["#000000", "#ffffff"],
          unit: "%",
        },
        { key: "contrast", label: "Contrast", min: 0.0, max: 3.0, unit: "%" },
        {
          key: "gamma",
          label: "Gamma",
          min: 0.1,
          max: 5.0,
          gradientColors: ["#000000", "#AAAAAA", "#FFFFFF"],
          unit: "",
        },
        {
          key: "shadows",
          label: "Shadows",
          min: 0.0,
          max: 0.99,
          color: "#444",
          unit: "%",
        },
        {
          key: "midtones",
          label: "Midtones",
          min: 0.1,
          max: 3.0,
          color: "#666",
          unit: "%",
        },
        {
          key: "highlights",
          label: "Highlights",
          min: 0.0,
          max: 2.0,
          color: "#888",
          unit: "%",
        },
        {
          key: "hue",
          label: "Hue",
          min: -180.0,
          max: 180.0,
          gradientColors: [
            "#ff0000",
            "#ffff00",
            "#00ff00",
            "#00ffff",
            "#0000ff",
            "#ff00ff",
            "#ff0000",
          ],
          unit: "°",
        },
        {
          key: "saturation",
          label: "Saturation",
          min: 0.0,
          max: 2.0,
          gradientColors: ["#867a7a", "#f80707"],
          unit: "%",
        },
        {
          key: "value",
          label: "Value",
          min: 0.0,
          max: 2.0,
          gradientColors: ["#0c0c0c", "#f2f2f2"],
          unit: "%",
        },
        { key: "vibrance", label: "vibrance", min: 0.0, max: 2.0, unit: "%" },
      ];

      this.sliders = {};
      slidersConfig.forEach((config) => {
        this.sliders[config.key] = createChannelSlider(
          this,
          config.key,
          config.label,
          config.min,
          config.max,
          config.color,
          config.gradientColors,
          config.unit,
          updateAdjust
        );
        this.custom_widgets.push(this.sliders[config.key]);
      });

      this.addWidget("button", "Reset", "reset", () => {
        if (confirm("Reset all adjustments?")) {
          this.properties.adjust_values = JSON.parse(
            JSON.stringify(DEFAULT_ADJUST_VALUES)
          );
          slidersConfig.forEach((config) => {
            updateHiddenWidget(
              this,
              config.key,
              this.properties.adjust_values[config.key]
            );
            this.sliders[config.key].setValue(
              this.properties.adjust_values[config.key],
              true
            );
          });
          this.requestPreviewUpdate();
        }
      });

      this.requestPreviewUpdate = createPreviewUpdateFunction(this);

      this.updateSlidersUI = () => {
        slidersConfig.forEach((config) => {
          this.sliders[config.key].setValue(
            this.properties.adjust_values[config.key],
            true
          );
        });
        this.setDirtyCanvas(true, true);
      };

      this.updateSlidersUI();
    };

    nodeType.prototype.computeSize = function (out) {
      let size = LiteGraph.LGraphNode.prototype.computeSize.call(this, out);
      const minWidth = 300;
      const minHeight = 640;
      size[0] = Math.max(minWidth, size[0]);
      size[1] = Math.max(minHeight, size[1]);
      return size;
    };

    nodeType.prototype.onDrawForeground = function (ctx) {
      originalOnDrawForeground?.call(this, ctx);
      if (this.flags.collapsed) return;

      ctx.save();
      const widgetHeight = this.widgets
        .filter((w) => !w.hidden && typeof w.computeSize === "function")
        .reduce((acc, w) => acc + w.computeSize([this.size[0]])[1], 0);

      const startY = widgetHeight + 40;
      const sliderSpacing = 30;

      Object.values(this.sliders).forEach((slider, i) => {
        slider.width = this.size[0] * 0.85;
        slider.x = this.size[0] / 2.0 - slider.width / 2.0;
        slider.y = startY + i * sliderSpacing;
        ctx.save();
        ctx.translate(slider.x, slider.y);
        slider.draw(ctx);
        ctx.restore();
      });

      const availableHeight = this.size[1] - 425;
      const previewSize = Math.min(this.size[0] * 0.95, availableHeight);
      const previewCenterX = this.size[0] / 2.0;
      const y = startY + Object.keys(this.sliders).length * sliderSpacing + 40;

      if (this._previewImage && this._previewImage.complete) {
        const img = this._previewImage;
        const aspect = img.width / img.height;
        let drawWidth, drawHeight;

        if (aspect >= 1) {
          drawWidth = previewSize;
          drawHeight = previewSize / aspect;
        } else {
          drawHeight = previewSize;
          drawWidth = previewSize * aspect;
        }

        const drawX = previewCenterX - drawWidth / 2;
        const drawY = y + (previewSize - drawHeight) / 2;

        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = "#AAA";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          "Run the graph once to generate preview.",
          previewCenterX,
          y + previewSize / 2 - 10
        );
        ctx.fillText(
          "Note: requires output connection to function.",
          previewCenterX,
          y + previewSize / 2 + 10
        );
        ctx.restore();
      }
      ctx.restore();
    };

    function patchNodeMouseHandlers(node) {
      const originalOnMouseDown = node.onMouseDown;
      const originalOnMouseMove = node.onMouseMove;
      const originalOnMouseUp = node.onMouseUp;
      const originalOnMouseLeave = node.onMouseLeave;

      function dispatch(eventType, event, localPos) {
        if (!node.custom_widgets) return false;

        for (const widget of node.custom_widgets) {
          const handler = widget[eventType];
          if (
            typeof handler === "function" &&
            handler.call(widget, event, localPos)
          ) {
            return true;
          }
        }

        return false;
      }

      node.onMouseDown = function (event, localPos, graphCanvas) {
        const wasHandled = originalOnMouseDown?.call(
          this,
          event,
          localPos,
          graphCanvas
        );
        if (wasHandled) return true;
        return dispatch("onMouseDown", event, localPos);
      };

      node.onMouseMove = function (event, localPos, graphCanvas) {
        const wasHandled = originalOnMouseMove?.call(
          this,
          event,
          localPos,
          graphCanvas
        );
        if (wasHandled) return true;
        return dispatch("onMouseMove", event, localPos);
      };

      node.onMouseUp = function (event, localPos, graphCanvas) {
        const wasHandled = originalOnMouseUp?.call(
          this,
          event,
          localPos,
          graphCanvas
        );
        if (wasHandled) return true;
        return dispatch("onMouseUp", event, localPos);
      };

      node.onMouseLeave = function (event, localPos, graphCanvas) {
        const wasHandled = originalOnMouseLeave?.call(
          this,
          event,
          localPos,
          graphCanvas
        );
        if (wasHandled) return true;

        const safePos = localPos ?? [
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ];

        for (const widget of node.custom_widgets || []) {
          if (typeof widget.onMouseLeave === "function") {
            widget.onMouseLeave(event, safePos);
          } else if (typeof widget.onMouseUp === "function") {
            widget.onMouseUp(event, safePos);
          }
        }

        return false;
      };
    }

    nodeType.prototype.onConfigure = function (info) {
      originalOnConfigure?.call(this, info);
      initAdjustProperties(this);
      if (this.properties.adjust_values) {
        queueMicrotask(() => {
          if (this.updateSlidersUI) {
            this.updateSlidersUI();
          }
        });
      }
      removeInputs(this, (input) => input.type === "STRING");

      this.forceUpdate();

      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype.onAdded = function () {
      patchNodeMouseHandlers(this);

      removeInputs(this, (input) => input.type === "STRING");
    };

    nodeType.prototype.forceUpdate = function () {
      const version_widget = this.getWidget("version");
      if (version_widget) {
        this.setWidgetValue(version_widget.name, Date.now());
      }
    };

    nodeType.prototype.onExecuted = function (message) {
      onExecutedOriginal?.apply(this, arguments);

      let key = message?.cache_key;

      if (Array.isArray(key)) {
        key = key.join("");
      }

      if (typeof key === "string") {
        this.previewCacheKey = key;
        this.requestPreviewUpdate();
      } else {
        console.warn("[OlmImageAdjust] Missing or invalid cache key:", key);
      }
    };
  },
});
