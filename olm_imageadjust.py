import torch
import numpy as np
from aiohttp import web
from server import PromptServer
import base64
from io import BytesIO
from PIL import Image
from collections import OrderedDict


DEBUG_MODE = False
PREVIEW_RESOLUTION = 512


def debug_print(*args, **kwargs):
    if DEBUG_MODE:
        print(*args, **kwargs)


preview_cache = OrderedDict()
MAX_CACHE_ITEMS = 10


def prune_node_cache(workflow_id, node_id):
    debug_print(
        "[OlmImageAdjust] Pruning cache, removing cached data for workflow:",
        workflow_id,
        ", node id:",
        node_id,
    )
    prefix = f"imageadjust_{workflow_id}_{node_id}"
    for key in list(preview_cache.keys()):
        if key.startswith(prefix):
            del preview_cache[key]


class OlmImageAdjust:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "version": ("STRING", {"default": "init"}),
                "image": ("IMAGE",),
                "exposure": (
                    "FLOAT",
                    {"default": 0.0, "min": -4.0, "max": 4.0, "step": 0.01},
                ),
                "brightness": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
                ),
                "contrast": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.01},
                ),
                "gamma": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.01},
                ),
                "shadows": (
                    "FLOAT",
                    {"default": 0.0, "min": 0.0, "max": 0.99, "step": 0.01},
                ),
                "midtones": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.1, "max": 3.0, "step": 0.01},
                ),
                "highlights": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
                ),
                "hue": (
                    "FLOAT",
                    {"default": 0.0, "min": -180.0, "max": 180.0, "step": 1.0},
                ),
                "saturation": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
                ),
                "value": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
                ),
                "vibrance": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01},
                ),
            },
            "optional": {},
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
                "node_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)

    FUNCTION = "adjust_image"
    CATEGORY = "image/color"

    def adjust_image(
        self,
        version,
        image: torch.Tensor,
        exposure,
        brightness,
        contrast,
        gamma,
        shadows,
        midtones,
        highlights,
        hue,
        saturation,
        value,
        vibrance,
        extra_pnginfo=None,
        node_id=None,
    ):
        debug_print("=" * 60)
        debug_print(f"[OlmImageAdjust id{node_id}] Applying image adjustments:")

        try:
            if not isinstance(image, torch.Tensor):
                raise TypeError("Input image must be a torch.Tensor")

            if image.dim() == 3:
                image = image.unsqueeze(0)

            workflow_id = None
            if extra_pnginfo and "workflow" in extra_pnginfo:
                workflow_id = extra_pnginfo["workflow"].get("id", "unknown")
            if node_id is None:
                node_id = "x"

            cache_key = f"imageadjust_{workflow_id}_{node_id}"
            debug_print("[OlmImageAdjust] cache key:", cache_key)

            prune_node_cache(workflow_id, node_id)
            preview_cache[cache_key] = image.clone().detach()

            preview_cache.move_to_end(cache_key)

            debug_print("[OlmImageAdjust] Cached items count:", len(preview_cache))
            debug_print(
                "[OlmImageAdjust] Current cache keys:", list(preview_cache.keys())
            )

            if len(preview_cache) > MAX_CACHE_ITEMS:
                oldest_key, _ = preview_cache.popitem(last=False)
                debug_print(f"[OlmImageAdjust] Pruned oldest cache entry: {oldest_key}")

            adjustments = {
                "exposure": float(exposure),
                "brightness": float(brightness),
                "contrast": float(contrast),
                "gamma": float(gamma),
                "shadows": float(shadows),
                "midtones": float(midtones),
                "highlights": float(highlights),
                "hue": float(hue),
                "saturation": float(saturation),
                "value": float(value),
                "vibrance": float(vibrance),
            }

            adjusted = apply_image_adjustments(image, adjustments)
            debug_print("=" * 60)

            return {
                "ui": {"cache_key": cache_key, "message": "Image adjustments applied"},
                "result": (adjusted,),
            }

        except Exception as e:
            print(f"[OlmImageAdjust Error] {e}")
            return {
                "ui": {"message": f"Failed to apply adjustments: {e}"},
                "result": (image,),
            }


@PromptServer.instance.routes.post("/olm/api/imageadjust/update")
async def handle_imageadjust_preview(request):
    debug_print("[OlmImageAdjust] /olm/api/imageadjust/update")
    try:
        data = await request.json()
        debug_print("[OlmImageAdjust] data:", data)

        adjustments = {
            "exposure": float(data.get("exposure", 0.0)),
            "brightness": float(data.get("brightness", 1.0)),
            "contrast": float(data.get("contrast", 1.0)),
            "gamma": float(data.get("gamma", 1.0)),
            "shadows": float(data.get("shadows", 0.0)),
            "midtones": float(data.get("midtones", 1.0)),
            "highlights": float(data.get("highlights", 1.0)),
            "hue": float(data.get("hue", 0.0)),
            "saturation": float(data.get("saturation", 1.0)),
            "value": float(data.get("value", 1.0)),
            "vibrance": float(data.get("vibrance", 1.0)),
        }

        key = request.query.get("key")
        if not key:
            return web.json_response(
                {"status": "error", "message": "Missing cache key"}, status=400
            )

        image = load_thumbnail_image(key)
        adjusted = apply_image_adjustments(image.unsqueeze(0), adjustments)
        img = tensor_to_pil(adjusted.squeeze(0))
        img_str = encode_to_base64(img)

        return web.json_response(
            {"status": "success", "updatedimage": f"data:image/png;base64,{img_str}"}
        )

    except Exception as e:
        debug_print("[OlmImageAdjust] Error during preview:", str(e))
        return web.json_response({"status": "error", "message": str(e)}, status=400)


def apply_image_adjustments(image: torch.Tensor, adjustments: dict):
    img = image.clone()

    img *= 2.0 ** adjustments["exposure"]
    img *= adjustments["brightness"]

    img = (img - 0.5) * adjustments["contrast"] + 0.5
    img = torch.clamp(img, 0.0, 1.0)

    img = (img - adjustments["shadows"]) / (1.0 - adjustments["shadows"] + 1e-10)
    img *= adjustments["highlights"]
    img = torch.clamp(img, 0.0, 1.0)

    img = torch.pow(img, 1.0 / adjustments["midtones"] + 1e-10)

    img = torch.pow(img, 1.0 / adjustments["gamma"] + 1e-10)

    img = torch.clamp(img, 0.0, 1.0)

    img = rgb_to_hsv(img)
    img[..., 0] = (img[..., 0] + adjustments["hue"] / 360.0) % 1.0
    img[..., 1] *= adjustments["saturation"]
    img[..., 2] *= adjustments["value"]
    img = torch.clamp(img, 0.0, 1.0)

    img = hsv_to_rgb(img)
    img = adjust_vibrance(img, adjustments["vibrance"])

    return torch.clamp(img, 0.0, 1.0)


def rgb_to_hsv(rgb: torch.Tensor):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    max_val, _ = torch.max(rgb, dim=-1)
    min_val, _ = torch.min(rgb, dim=-1)
    delta = max_val - min_val

    h = torch.zeros_like(max_val)
    mask = delta != 0
    h[mask & (max_val == r)] = ((g - b) / (delta + 1e-10))[mask & (max_val == r)] / 6.0
    h[mask & (max_val == g)] = (2.0 + (b - r) / (delta + 1e-10))[
        mask & (max_val == g)
    ] / 6.0
    h[mask & (max_val == b)] = (4.0 + (r - g) / (delta + 1e-10))[
        mask & (max_val == b)
    ] / 6.0
    h = (h + 1.0) % 1.0

    s = torch.where(max_val != 0, delta / (max_val + 1e-10), torch.zeros_like(max_val))
    v = max_val

    return torch.stack([h, s, v], dim=-1)


def hsv_to_rgb(hsv: torch.Tensor):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    h = h * 6.0
    i = torch.floor(h).long()
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))

    i = i % 6

    rgb = torch.zeros_like(hsv)

    for idx in range(6):
        mask = i == idx
        for c in range(3):
            if c == 0:
                val = [v, q, p, p, t, v][idx]
            elif c == 1:
                val = [t, v, v, q, p, p][idx]
            else:
                val = [p, p, t, v, v, q][idx]
            rgb[..., c] = torch.where(mask, val, rgb[..., c])

    return rgb


def adjust_vibrance(image: torch.Tensor, vibrance: float):
    hsv = rgb_to_hsv(image)
    boost = (1.0 - hsv[..., 1]) * (vibrance - 1.0)
    hsv[..., 1] = torch.clamp(hsv[..., 1] + boost, 0.0, 1.0)
    return hsv_to_rgb(hsv)


def load_thumbnail_image(cache_key):
    if cache_key not in preview_cache:
        raise ValueError(
            "[OlmImageAdjust] No cached image available. Please run the node first."
        )
    return downscale_image(
        preview_cache[cache_key], size=(PREVIEW_RESOLUTION, PREVIEW_RESOLUTION)
    )


def downscale_image(tensor, size=(PREVIEW_RESOLUTION, PREVIEW_RESOLUTION)):
    if tensor.dim() == 3:
        tensor = tensor.unsqueeze(0)
    B, H, W, C = tensor.shape
    max_w, max_h = size
    aspect = W / H

    if W / max_w > H / max_h:
        target_w = max_w
        target_h = round(max_w / aspect)
    else:
        target_h = max_h
        target_w = round(max_h * aspect)

    resized = torch.nn.functional.interpolate(
        tensor.permute(0, 3, 1, 2),
        size=(target_h, target_w),
        mode="bilinear",
        align_corners=False,
    ).permute(0, 2, 3, 1)

    return resized.squeeze(0)


def tensor_to_pil(tensor):
    tensor = tensor.clamp(0, 1).cpu().numpy()
    return Image.fromarray((tensor * 255).astype("uint8"))


def encode_to_base64(img: Image.Image) -> str:
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


NODE_CLASS_MAPPINGS = {"OlmImageAdjust": OlmImageAdjust}


NODE_DISPLAY_NAME_MAPPINGS = {"OlmImageAdjust": "Olm Image Adjust"}


WEB_DIRECTORY = "./web"
