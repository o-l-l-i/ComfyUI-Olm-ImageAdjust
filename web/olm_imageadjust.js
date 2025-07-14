import { app } from "../../scripts/app.js";

class ChannelSliderWidget {
  constructor(node, name, value, callback, options = {}) {
    this.node = node;
    this.name = name;
    this.value = value;
    this.callback = callback;

    this.options = {
      min: -1.0,
      max: 1.0,
      label: name,
      color: "#4A4A4A",
      gradientColors: [],
      unit: "%",
      ...options,
    };

    this.dragging = false;
    this.x = 0;
    this.y = 0;
    this.width = 250;
    this.height = 20;
  }

  draw(ctx) {
    const sliderHeight = 4;
    const knobRadius = 5;
    const x = 0;
    const y = this.height / 2;

    ctx.font = "10px Arial";
    ctx.fillStyle = "#ddd";
    ctx.textAlign = "left";
    ctx.fillText(this.options.label, x, y - 10);

    const trackX = x;
    const trackY = y;
    const trackW = this.width;
    const trackH = sliderHeight;

    let gradient = ctx.createLinearGradient(
      trackX,
      trackY,
      trackX + trackW,
      trackY
    );

    function isValidColor(color) {
      const s = new Option().style;
      s.color = color;
      return s.color !== "";
    }

    const gradientColors = this.options.gradientColors;

    if (
      Array.isArray(gradientColors) &&
      gradientColors.length >= 2 &&
      gradientColors.every(isValidColor)
    ) {
      const stopCount = gradientColors.length;
      gradientColors.forEach((color, index) => {
        const t = index / (stopCount - 1);
        gradient.addColorStop(t, color);
      });
    } else {
      gradient.addColorStop(0, this.options.color);
      gradient.addColorStop(1, this.options.color);
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(trackX, trackY, trackW, trackH, 4);
    ctx.fill();

    const normalizedValue =
      (this.value - this.options.min) / (this.options.max - this.options.min);
    const fillWidth = normalizedValue * this.width;

    if (fillWidth < trackW) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.roundRect(
        trackX + fillWidth,
        trackY,
        trackW - fillWidth,
        trackH,
        [0, 4, 4, 0]
      );
      ctx.fill();
    }

    const knobX = trackX + fillWidth;
    ctx.beginPath();
    ctx.arc(knobX, trackY + trackH / 2, knobRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "10px Arial";
    ctx.fillStyle = "#ddd";
    ctx.textAlign = "right";

    let displayValue;
    let unit = this.options.unit;
    if (this.options.unit === "°") {
      displayValue = this.value.toFixed(2);
    } else if (this.options.unit === "%") {
      displayValue = (this.value * 100).toFixed(0);
    } else {
      displayValue = this.value.toFixed(2);
    }

    ctx.fillText(`${displayValue}${unit}`, this.width, y - 10);
  }

  onMouseDown(event, localPos) {
    const { x, y } = this.getLocalMouse(localPos);
    if (x >= 0 && x <= this.width && y >= 0 && y <= this.height) {
      this.dragging = true;
      this.updateValue(x);
      this.node.setDirtyCanvas(true, true);
      return true;
    }
    return false;
  }

  onMouseMove(event, localPos) {
    if (!this.dragging) return false;

    if (event.buttons !== 1) {
      this.onMouseUp();
      return false;
    }
    const { x } = this.getLocalMouse(localPos);
    this.updateValue(x);
    this.node.setDirtyCanvas(true, true);
    return true;
  }

  onMouseUp() {
    if (this.dragging) {
      this.dragging = false;
      this.node.setDirtyCanvas(true, true);
      return true;
    }
    return false;
  }

  getLocalMouse(localPos) {
    return {
      x: localPos[0] - this.x,
      y: localPos[1] - this.y,
    };
  }

  updateValue(x) {
    const clampedX = Math.max(0, Math.min(x, this.width));
    const normalized = clampedX / this.width;
    this.value =
      normalized * (this.options.max - this.options.min) + this.options.min;
    this.value = Math.max(
      this.options.min,
      Math.min(this.value, this.options.max)
    );

    if (this.callback) {
      this.callback(this.value);
    }
  }

  setValue(newValue, silent = false) {
    this.value = Math.max(
      this.options.min,
      Math.min(newValue, this.options.max)
    );
    if (!silent && this.callback) {
      this.callback(this.value);
    }
    this.node.setDirtyCanvas(true, true);
  }
}

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
      fetch("/olm/api/imageadjust/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(node.properties.adjust_values),
      })
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
  name: "olm.image.imageadjust",
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
    const originalOnMouseDown = nodeType.prototype.onMouseDown;
    const originalOnMouseMove = nodeType.prototype.onMouseMove;
    const originalOnMouseUp = nodeType.prototype.onMouseUp;
    const originalOnMouseLeave = nodeType.prototype.onMouseLeave;
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

    nodeType.prototype.onMouseDown = function (event, localPos, graphCanvas) {
      if (originalOnMouseDown?.call(this, event, localPos, graphCanvas))
        return true;
      if (this.custom_widgets) {
        for (const w of this.custom_widgets) {
          if (
            typeof w.onMouseDown === "function" &&
            w.onMouseDown(event, localPos)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    nodeType.prototype.onMouseMove = function (event, localPos, graphCanvas) {
      if (originalOnMouseMove?.call(this, event, localPos, graphCanvas))
        return true;
      if (this.custom_widgets) {
        for (const w of this.custom_widgets) {
          if (
            typeof w.onMouseMove === "function" &&
            w.onMouseMove(event, localPos)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    nodeType.prototype.onMouseUp = function (event, localPos, graphCanvas) {
      if (originalOnMouseUp?.call(this, event, localPos, graphCanvas))
        return true;
      if (this.custom_widgets) {
        for (const w of this.custom_widgets) {
          if (
            typeof w.onMouseUp === "function" &&
            w.onMouseUp(event, localPos)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    nodeType.prototype.onMouseLeave = function (event, localPos, graphCanvas) {
      if (originalOnMouseLeave?.call(this, event, localPos, graphCanvas))
        return true;
      if (this.custom_widgets) {
        for (const w of this.custom_widgets) {
          if (
            typeof w.onMouseUp === "function" &&
            w.onMouseUp(event, localPos)
          ) {
            return true;
          }
        }
      }
      return false;
    };

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
      removeInputs(
        this,
        (input) => input.type === "FLOAT" || input.type === "STRING"
      );

      this.forceUpdate();

      this.setDirtyCanvas(true, true);
    };

    nodeType.prototype.forceUpdate = function () {
      const version_widget = this.getWidget("version");
      if (version_widget) {
        this.setWidgetValue(version_widget.name, Date.now());
      }
    };

    nodeType.prototype.onExecuted = function (message) {
      onExecutedOriginal?.apply(this, arguments);
      this.requestPreviewUpdate();
    };
  },
});
