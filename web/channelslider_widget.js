export class ChannelSliderWidget {
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
