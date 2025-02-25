/*********/
/* COLOR */
/*********/

Color = {
	ColorSpace: {
		RGB:   "RGB",
		HSV:   "HSV",
		HSL:   "HSL",
		XYZ:   "XYZ",
		Lab:   "Lab",
		YCC:   "YCC",
		Oklab: "Oklab",
		Oklch: "Oklch"
	},

	ColorTransform: {
		COLORIZE: "colorize"
	},

	ColorTransformSettings: {
		"colorize": {
			defaultColorSpace: "Oklch",
			"Lab": {
				//	L (lightness)
				minBaseValue: 0.00,
				maxBaseValue: 0.70
			},
			"YCC": {
				//	Y (luma)
				minBaseValue: 0.48,
				maxBaseValue: 0.50
			},
			"Oklab": {
				//	L (lightness)
				minBaseValue: 0.62,
				maxBaseValue: 0.77
			},
			"Oklch": {
				//	L (lightness)
				minBaseValue: 0.62,
				maxBaseValue: 0.77,
				chromaBoostFactor: 0.75, // values above 1.0 possible... but not recommended
				antiClusteringFactor: 0.75 // [ 0.0, 1.0 ]
			},
			"HSL": {
				//	L (lightness)
				minBaseValue: 0.65,
				maxBaseValue: 0.77,
				saturationBoostFactor: 0.50, // [ 0.0, 1.0 ]
				antiClusteringFactor: 0.25 // [ 0.0, 1.0 ]
			}
		}
	},

	processColorValue: (colorString, transforms, options) => {
		options = Object.assign({
			//	By default, we output in the same format as the input.
			output: colorString.startsWith("#") ? "hex" : "rgba"
		}, options);

		//	Save original value (for alpha restoration later).
		let originalColorRGBA = Color.rgbaFromString(colorString);
		let transformedValueRGBA = originalColorRGBA;

		//	Apply transforms.
		transforms.forEach(transform => {
			if (transform.type == Color.ColorTransform.COLORIZE) {
				let workingColorSpace = (   transform.colorSpace 
										 ?? Color.ColorTransformSettings[transform.type].defaultColorSpace);
				let referenceColorRGBA = Color.rgbaFromString(transform.referenceColor);
				let subjectColorInWorkingColorSpace = Color.fromRGB(transformedValueRGBA, workingColorSpace);
				let referenceColorInWorkingColorSpace = Color.fromRGB(referenceColorRGBA, workingColorSpace);
				let transformedSubjectColorInWorkingColorSpace = Color.colorValueTransform_colorize(subjectColorInWorkingColorSpace,
																									referenceColorInWorkingColorSpace,
																									workingColorSpace);
				transformedValueRGBA = Color.rgbFrom(transformedSubjectColorInWorkingColorSpace, workingColorSpace);
			}
		});

		//	Restore alpha value (discarded during processing).
		transformedValueRGBA.alpha = originalColorRGBA.alpha;

		return (options.output == "hex"
				? Color.hexStringFromRGB(transformedValueRGBA)
				: Color.rgbaStringFromRGBA(transformedValueRGBA));
	},

	/*	In L*a*b* or Oklab, retain lightness (L*) but set color (a* and b*) 
		from the specified reference color.

		In Oklch, retain lightness (L) but set chroma (C) and hue (h°) from the
		specified reference color.

		In YCoCg, retain luma (Y) but set chroma (Co and Cg) from the specified
		reference color.

		In HSL, retain lightness (L) but set saturation (S) and hue (H) from
		the specified reference color.

		In any other color space, has no effect.
	 */
	colorValueTransform_colorize: (color, referenceColor, colorSpace) => {
		if ([ Color.ColorSpace.Lab,
			  Color.ColorSpace.YCC,
			  Color.ColorSpace.Oklab,
			  Color.ColorSpace.Oklch,
			  Color.ColorSpace.HSL
			  ].includes(colorSpace) == false)
			return color;

		let minBaseValue = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE][colorSpace].minBaseValue;
		let maxBaseValue = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE][colorSpace].maxBaseValue;

		if (colorSpace == Color.ColorSpace.Lab) {
			color.a = referenceColor.a;
			color.b = referenceColor.b;

			let baseLightness = Math.max(Math.min(referenceColor.L, maxBaseValue), minBaseValue);
			color.L = baseLightness + (1.0 - baseLightness) * color.L;
		} else if (colorSpace == Color.ColorSpace.YCC) {
			color.Co = referenceColor.Co;
			color.Cg = referenceColor.Cg;

			let baseLuma = Math.max(Math.min(referenceColor.Y, maxBaseValue), minBaseValue);
			color.Y  = baseLuma + (1.0 - baseLuma) * color.Y;
		} else if (colorSpace == Color.ColorSpace.Oklab) {
			color.a = referenceColor.a;
			color.b = referenceColor.b;

			let baseLightness = Math.max(Math.min(referenceColor.L, maxBaseValue), minBaseValue);
			color.L = baseLightness + (1.0 - baseLightness) * color.L;
		} else if (colorSpace == Color.ColorSpace.Oklch) {
			color.C = referenceColor.C;
			color.h = referenceColor.h;

			let baseLightness = Math.max(Math.min(referenceColor.L, maxBaseValue), minBaseValue);
			color.L = baseLightness + (1.0 - baseLightness) * color.L;

			//	Saturate.
			let maxChroma = Color.oklchFromRGB(Color.rgbFromOklch({ L: color.L, C: 1.0, h: color.h })).C;
			let chromaBoostFactor = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE]["Oklch"].chromaBoostFactor;
			let antiClusteringFactor = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE]["Oklch"].antiClusteringFactor;
			color.C += chromaBoostFactor * (maxChroma - color.C) * (1.0 - color.L * antiClusteringFactor);

			//	Gamut correction.
			let maxLightness = Color.oklchFromRGB(Color.rgbFromOklch({ L: 1.0, C: color.C, h: color.h })).L;
			if (color.L > maxLightness)
				color.C *= (1.0 - color.L) / (1.0 - maxLightness);
		} else if (colorSpace == Color.ColorSpace.HSL) {
			color.hue = referenceColor.hue;
			color.saturation = referenceColor.saturation;

			//	Gamma correction.
// 			color.lightness = Math.pow(color.lightness, 0.5);

			let baseLightness = Math.max(Math.min(referenceColor.lightness, maxBaseValue), minBaseValue);
			color.lightness = baseLightness + (1.0 - baseLightness) * color.lightness;

			//	Saturate.
			let saturationBoostFactor = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE]["HSL"].saturationBoostFactor;
			let antiClusteringFactor = Color.ColorTransformSettings[Color.ColorTransform.COLORIZE]["HSL"].antiClusteringFactor;
			color.saturation += saturationBoostFactor * (1.0 - color.saturation) * (1.0 - color.lightness * antiClusteringFactor);
		}

		return color;
	},

	rgbaFromString: (colorString) => {
		let rgba = { };
		if (colorString.startsWith("#")) {
			let bareHexValues = colorString.slice(1);
			if (bareHexValues.length == "3")
				bareHexValues = bareHexValues.replace(/./g, "$&$&");
			let values = bareHexValues.match(/../g).map(hexString => parseInt(hexString, 16));
			rgba = Object.fromEntries([
				[ "red",   values[0] ],
				[ "green", values[1] ],
				[ "blue",  values[2] ],
				[ "alpha", 1.0       ]
			]);
		} else if (colorString.toLowerCase().startsWith("rgb")) {
			let values = colorString.match(/rgba?\((.+?)\)/)[1].replace(/\s/, "").split(",").map(decString => parseInt(decString));
			rgba = Object.fromEntries([
				[ "red",   values[0] ],
				[ "green", values[1] ],
				[ "blue",  values[2] ],
				[ "alpha", values[3] ?? 1.0 ]
			]);
		}
		return rgba;
	},

	hexStringFromRGB: (rgb) => {
		return ("#" + [ rgb.red, rgb.green, rgb.blue ].map(hexValue => Math.round(hexValue).toString(16).padStart(2, "0")).join(""));
	},

	rgbaStringFromRGBA: (rgba) => {
		return (  "rgba(" 
				+ [ rgba.red, rgba.green, rgba.blue ].map(value => Math.round(value).toString().padStart(3, " ")).join(", ") 
				+ ", " + Math.round(rgba.alpha ?? 1.0).toString()
				+ ")");
	},

	//	Main convenience method (from RGB).
	fromRGB: (rgb, targetColorSpace) => {
		switch (targetColorSpace) {
		case Color.ColorSpace.HSV:
			return Color.hsvFromRGB(rgb);
		case Color.ColorSpace.HSL:
			return Color.hslFromRGB(rgb);
		case Color.ColorSpace.Lab:
			return Color.labFromRGB(rgb);
		case Color.ColorSpace.YCC:
			return Color.yccFromRGB(rgb);
		case Color.ColorSpace.Oklab:
			return Color.oklabFromRGB(rgb);
		case Color.ColorSpace.Oklch:
			return Color.oklchFromRGB(rgb);
		case Color.ColorSpace.RGB:
			return rgb;
		default:
			return null;
		}
	},

	//	Main convenience method (to RGB).
	rgbFrom: (color, sourceColorSpace) => {
		switch (sourceColorSpace) {
		case Color.ColorSpace.HSV:
			return Color.rgbFromHSV(color);
		case Color.ColorSpace.HSL:
			return Color.rgbFromHSL(color);
		case Color.ColorSpace.Lab:
			return Color.rgbFromLab(color);
		case Color.ColorSpace.YCC:
			return Color.rgbFromYCC(color);
		case Color.ColorSpace.Oklab:
			return Color.rgbFromOklab(color);
		case Color.ColorSpace.Oklch:
			return Color.rgbFromOklch(color);
		case Color.ColorSpace.RGB:
			return color;
		default:
			return null;
		}
	},

	//	Convenience method.
	labFromRGB: (rgb) => {
		return Color.labFromXYZ(Color.xyzFromRGB(rgb));
	},

	//	Convenience method.
	rgbFromLab: (lab) => {
		return Color.rgbFromXYZ(Color.xyzFromLab(lab));
	},

	//	Convenience method.
	oklabFromRGB: (rgb) => {
		return Color.oklabFromXYZ(Color.xyzFromRGB(rgb));
	},

	//	Convenience method.
	rgbFromOklab: (oklab) => {
		return Color.rgbFromXYZ(Color.xyzFromOklab(oklab));
	},

	//	Convenience method.
	oklchFromRGB: (rgb) => {
		return Color.oklchFromOklab(Color.oklabFromXYZ(Color.xyzFromRGB(rgb)));
	},

	//	Convenience method.
	rgbFromOklch: (oklch) => {
		return Color.rgbFromXYZ(Color.xyzFromOklab(Color.oklabFromOklch(oklch)));
	},

	oklchFromOklab: (oklab) => {
		return {
			L: oklab.L,
			C: Math.sqrt(Math.pow(oklab.a, 2) + Math.pow(oklab.b, 2)),
			h: Math.atan2(oklab.b, oklab.a)
		};
	},

	oklabFromOklch: (oklch) => {
		return {
			L: oklch.L,
			a: oklch.C * Math.cos(oklch.h),
			b: oklch.C * Math.sin(oklch.h)
		};
	},

	oklabFromXYZ: (xyz) => {
		let l = Math.pow(xyz.x *  0.8189330101 + xyz.y *  0.3618667424 + xyz.z * -0.1288597137, 1.0/3.0);
		let m = Math.pow(xyz.x *  0.0329845436 + xyz.y *  0.9293118715 + xyz.z *  0.0361456387, 1.0/3.0);
		let s = Math.pow(xyz.x *  0.0482003018 + xyz.y *  0.2643662691 + xyz.z *  0.6338517070, 1.0/3.0);

		return {
			L: l *  0.2104542553 + m *  0.7936177850 + s * -0.0040720468,
			a: l *  1.9779984951 + m * -2.4285922050 + s *  0.4505937099,
			b: l *  0.0259040371 + m *  0.7827717662 + s * -0.8086757660
		};
	},

	xyzFromOklab: (oklab) => {
		let l = Math.pow(oklab.L *  0.9999999985 + oklab.a *  0.3963377922 + oklab.b *  0.2158037581, 3);
		let m = Math.pow(oklab.L *  1.0000000089 + oklab.a * -0.1055613423 + oklab.b * -0.0638541748, 3);
		let s = Math.pow(oklab.L *  1.0000000547 + oklab.a * -0.0894841821 + oklab.b * -1.2914855379, 3);

		return {
			x: l *  1.2270138511 + m * -0.5577999807 + s *  0.2812561490,
			y: l * -0.0405801784 + m *  1.1122568696 + s * -0.0716766787,
			z: l * -0.0763812845 + m * -0.4214819784 + s *  1.5861632204
		};
	},

	//	https://en.wikipedia.org/wiki/YCoCg
	yccFromRGB: (rgb) => {
		let red   = rgb.red   / 255.0;
		let green = rgb.green / 255.0;
		let blue  = rgb.blue  / 255.0;

		return {
			Y:  red *  0.25 + green * 0.50 + blue *  0.25,
			Co: red *  0.50                + blue * -0.50,
			Cg: red * -0.25 + green * 0.50 + blue * -0.25
		}
	},

	rgbFromYCC: (ycc) => {
		return {
			red:   Math.max(0.0, Math.min(1.0, ycc.Y + ycc.Co - ycc.Cg)) * 255.0,
			green: Math.max(0.0, Math.min(1.0, ycc.Y          + ycc.Cg)) * 255.0,
			blue:  Math.max(0.0, Math.min(1.0, ycc.Y - ycc.Co - ycc.Cg)) * 255.0
		}
	},

	hslFromRGB: (rgb) => {
		let red   = rgb.red   / 255.0;
		let green = rgb.green / 255.0;
		let blue  = rgb.blue  / 255.0;

		let minValue = Math.min(red, green, blue);
		let maxValue = Math.max(red, green, blue);
		let maxDelta = maxValue - minValue;

		let hue = 0.0;
		let saturation = 0.0;
		let lightness = (maxValue + minValue) / 2.0;

		if (maxDelta != 0.0) {
			saturation = lightness > 0.5
						 ? maxDelta / (2.0 - (maxValue + minValue))
						 : maxDelta / (maxValue + minValue);

			     if (red   == maxValue) hue = (green - blue)  / maxDelta + (green < blue ? 6.0 : 0.0);
			else if (green == maxValue) hue = (blue  - red)   / maxDelta + 2.0;
			else if (blue  == maxValue) hue = (red   - green) / maxDelta + 4.0;

			hue /= 6.0;
		}
	
		return {
			hue:        hue,
			saturation: saturation,
			lightness:  lightness
		};
	},

	rgbFromHSL: (hsl) => {
		let red, green, blue;

		if (hsl.saturation != 0.0) {
			function colorChannelFromHue(p, q, t) {
				if (t < 0.0) t += 1.0;
				if (t > 1.0) t -= 1.0;

				if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
				if (t < 1.0/2.0) return q;
				if (t < 2.0/3.0) return p + (q - p) * 6.0 * (2.0/3.0 - t);

				return p;
			}

			let q = hsl.lightness < 0.5
					? hsl.lightness * (1.0 + hsl.saturation)
					: hsl.lightness + hsl.saturation - (hsl.lightness * hsl.saturation);
			let p = 2.0 * hsl.lightness - q;

			red   = colorChannelFromHue(p, q, hsl.hue + 1.0/3.0);
			green = colorChannelFromHue(p, q, hsl.hue);
			blue  = colorChannelFromHue(p, q, hsl.hue - 1.0/3.0);
		} else {
			red = green = blue = hsl.lightness;
		}

		return {
			red:   red   * 255.0,
			green: green * 255.0,
			blue:  blue  * 255.0
		};
	},

	hsvFromRGB: (rgb) => {
		let red   = rgb.red   / 255.0;
		let green = rgb.green / 255.0;
		let blue  = rgb.blue  / 255.0;

		let minValue = Math.min(red, green, blue);
		let maxValue = Math.max(red, green, blue);
		let maxDelta = maxValue - minValue;

		let hue = 0.0;
		let saturation = 0.0;
		let value = maxValue;

		if (maxDelta != 0.0) {
			saturation = maxDelta / maxValue;

			let deltaRed   = (((maxValue - red)   / 6.0) + (maxDelta / 2.0)) / maxDelta;
			let deltaGreen = (((maxValue - green) / 6.0) + (maxDelta / 2.0)) / maxDelta;
			let deltaBlue  = (((maxValue - blue)  / 6.0) + (maxDelta / 2.0)) / maxDelta;

			     if (red   == maxValue) hue =             deltaBlue  - deltaGreen;
			else if (green == maxValue) hue = (1.0/3.0) + deltaRed   - deltaBlue;
			else if (blue  == maxValue) hue = (2.0/3.0) + deltaGreen - deltaRed;

			     if (hue < 0.0) hue += 1.0;
			else if (hue > 1.0) hue -= 1.0;
		}
	
		return {
			hue:        hue,
			saturation: saturation,
			value:      value
		};
	},

	rgbFromHSV: (hsv) => {
		let red, greed, blue;

		if (hsv.saturation != 0.0) {
			let h = hsv.hue * 6.0;
			if (h == 6.0)
				h = 0.0;
			let i = Math.floor(h);
			let value1 = hsv.value * (1.0 - hsv.saturation);
			let value2 = hsv.value * (1.0 - hsv.saturation * (h - i));
			let value3 = hsv.value * (1.0 - hsv.saturation * (1.0 - (h - i)));
		
			red = green = blue = 0.0;

			     if (i == 0.0) { red = hsv.value; green = value3;    blue = value1;    }
			else if (i == 1.0) { red = value2;    green = hsv.value; blue = value1;    }
			else if (i == 2.0) { red = value1;    green = hsv.value; blue = value3;    }
			else if (i == 3.0) { red = value1;    green = value2;    blue = hsv.value; }
			else if (i == 4.0) { red = value3;    green = value1;    blue = hsv.value; }
			else               { red = hsv.value; green = value1;    blue = value2;    }
		} else {
			red = green = blue = hsv.value;
		}
	
		return {
			red:   red   * 255.0,
			green: green * 255.0,
			blue:  blue  * 255.0
		};
	},

	xyzFromRGB: (rgb) => {
		let rgbValues = [ rgb.red, rgb.green, rgb.blue ];

		for (let [ i, value ] of Object.entries(rgbValues)) {
			value /= 255.0;
			rgbValues[i] = value > 0.04045 
						   ? Math.pow(((value + 0.055) / 1.055), 2.4)
						   : value / 12.92;
		}

		let [ red, green, blue ] = rgbValues;

		return {
			x: red * 0.4124 + green * 0.3576 + blue * 0.1805,
			y: red * 0.2126 + green * 0.7152 + blue * 0.0722,
			z: red * 0.0193 + green * 0.1192 + blue * 0.9505
		}
	},

	rgbFromXYZ: (xyz) => {
		let x = xyz.x;
		let y = xyz.y;
		let z = xyz.z;

		let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
		let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
		let b = x *  0.0557 + y * -0.2040 + z *  1.0570;

		let rgbValues = [ r, g, b ];

		for (let [ i, value ] of Object.entries(rgbValues)) {
			value = value > 0.0031308
					? 1.055 * Math.pow(value, (1.0/2.4)) - 0.055 
					: 12.92 * value;
			rgbValues[i] = Math.min(Math.max(value, 0.0), 1.0) * 255.0;
		}

		return {
			red:   rgbValues[0],
			green: rgbValues[1],
			blue:  rgbValues[2],
		};
	},

	labFromXYZ: (xyz) => {
		let xyzValues = [ xyz.x, xyz.y, xyz.z ];

		xyzValues[0] /= 0.95047;
		xyzValues[1] /= 1.00000;
		xyzValues[2] /= 1.08883;

		for (let [ i, value ] of Object.entries(xyzValues)) {
			xyzValues[i] = value > 0.008856
						   ? Math.pow(value, (1.0/3.0))
						   : (7.787 * value) + (0.16/1.16);
		}

		let [ x, y, z ] = xyzValues;

		return {
			L: (1.16 * y) - 0.16,
			a: 5.0 * (x - y),
			b: 2.0 * (y - z)
		};
	},

	xyzFromLab: (lab) => {
		let y = (lab.L + 0.16) / 1.16;
		let x = lab.a / 5.0 + y;
		let z = y - lab.b / 2.0;

		let xyzValues = [ x, y, z ];

		for (let [ i, value ] of Object.entries(xyzValues)) {
			xyzValues[i] = Math.pow(value, 3) > 0.008856 
						   ? Math.pow(value, 3) 
						   : (value - 0.16/1.16) / 7.787;
		}

		return {
			x: xyzValues[0] * 0.95047,
			y: xyzValues[1] * 1.00000,
			z: xyzValues[2] * 1.08883,
		};
	}
};
/*******************/
/* INJECT TRIGGERS */
/*******************/

GW.elementInjectTriggers = { };
GW.defunctElementInjectTriggers = { };

/****************************************************************************/
/*  Register element inject trigger for the given uuid. (In other words, when
    element with `data-uuid` attribute with value equal to the given uuid is
    injected into the document, run the given function on the element.)

    Returns the uuid.

    (If null is passed for the uuid, one will be generated automatically.)

    Each entry thus added triggers only once per uuid, then deletes itself.
 */
function onInject(uuid, f) {
    uuid = uuid ?? crypto.randomUUID();

    GW.elementInjectTriggers[uuid] = f;

    return uuid;
}

/***********************************************************************/
/*  Watch for element injections in the given document. Process injected
    elements through registered inject triggers.
 */
function observeInjectedElementsInDocument(doc) {
    let observer = new MutationObserver((mutationsList, observer) => {
        if (Object.entries(GW.elementInjectTriggers).length == 0)
            return;

        let doTrigger = (element, f) => {
            GW.defunctElementInjectTriggers[element.dataset.uuid] = f;
            delete GW.elementInjectTriggers[element.dataset.uuid];
            f(element);
        };

        for (mutationRecord of mutationsList) {
            for (let [ uuid, f ] of Object.entries(GW.elementInjectTriggers)) {
                for (node of mutationRecord.addedNodes) {
                    if (node instanceof HTMLElement) {
                        if (node.dataset.uuid == uuid) {
                            doTrigger(node, f);
                            break;
                        } else {
                            let nestedNode = node.querySelector(`[data-uuid='${uuid}']`);
                            if (nestedNode) {
                                doTrigger(nestedNode, f);
                                break;
                            }
                        }
                    }
                }
            }
        }
    });

    observer.observe(doc, { subtree: true, childList: true });
}

observeInjectedElementsInDocument(document);

/******************************************************************************/
/*  Returns a placeholder element that, when injected, replaces itself with the
    return value of the provided replacement function (to which the placeholder
    is passed).

    If an optional wrapper function is given, replacement is done within an
    anonymous closure which is passed to the wrapper function. (This can be
    used to, e.g., delay replacement, by passing a suitable doWhen function
    as the wrapper.)
 */
function placeholder(replaceFunction, wrapperFunction) {
    let transform = wrapperFunction
                    ? (element) => { wrapperFunction(() => { element.replaceWith(replaceFunction(element)); }); }
                    : (element) => { element.replaceWith(replaceFunction(element)); }

    let uuid = onInject(null, transform);

    return `<span class="placeholder" data-uuid="${uuid}"></span>`;
}

/*****************************************************************************/
/*  Generate new UUIDs for any placeholder elements in the given container.
    (Necessary when using a DocumentFragment to make a copy of a subtree;
     otherwise - since inject triggers are deleted after triggering once -
     any placeholders in the copied subtree will never get replaced.)
 */
function regeneratePlaceholderIds(container) {
    container.querySelectorAll(".placeholder").forEach(placeholder => {
        placeholder.dataset.uuid = onInject(null, (   GW.elementInjectTriggers[placeholder.dataset.uuid]
                                                   ?? GW.defunctElementInjectTriggers[placeholder.dataset.uuid]));
    });
}


/**********/
/* ASSETS */
/**********/

doAjax({
    location: versionedAssetURL("/static/img/icon/icons.svg"),
    onSuccess: (event) => {
        GW.svgIconFile = newDocument(event.target.response);

        GW.notificationCenter.fireEvent("GW.SVGIconsLoaded");
    }
});

function doWhenSVGIconsLoaded(f) {
    if (GW.svgIconFile != null)
        f();
    else
        GW.notificationCenter.addHandlerForEvent("GW.SVGIconsLoaded", (info) => {
            f();
        }, { once: true });
}

GW.svg = (icon) => {
    if (GW.svgIconFile == null)
        return placeholder(element => elementFromHTML(GW.svg(icon)), doWhenSVGIconsLoaded);

    let iconView = GW.svgIconFile.querySelector(`#${icon}`);
    if (iconView == null)
        return null;

    let viewBox = iconView.getAttribute("viewBox").split(" ").map(x => parseFloat(x));
    let g = iconView.nextElementSibling;
    let xOffset = parseFloat(g.getAttribute("transform").match(/translate\((.+?), .+\)/)[1]);
    viewBox[0] -= xOffset;
    viewBox = viewBox.join(" ");

    return (  `<svg
    			xmlns="http://www.w3.org/2000/svg"
    			viewBox="${viewBox}"
    			>`
            + g.innerHTML
            + `</svg>`);
};


/******************/
/* ASSET VERSIONS */
/******************/

GW.assetVersions = (GW.assetVersions ?? { });

/*****************************************************************************/
/*  Return fully qualified, versioned (if possible) URL for asset at the given
    path.
 */
function versionedAssetURL(pathname) {
    let version = GW.assetVersions[pathname];
    let versionString = (version ? `?v=${version}` : ``);
    return URLFromString(pathname + versionString);
}

/***************************************************************************/
/*	Convenience function for shared code between uses of getAssetPathname().
 */
function processAssetSequenceOptions(options, metaOptions) {
	metaOptions = Object.assign({
		currentAssetURL: null,
		assetSavedIndexKey: null
	}, metaOptions);

	let sequenceIndex, sequenceCurrent;
	if (GW.allowedAssetSequencingModes.includes(options.sequence) == false) {
		sequenceIndex = null;
		sequenceCurrent = null;
	} else if (options.sequence.endsWith("Current")) {
		for (let prefix of [ "next", "previous" ])
			if (options.sequence.startsWith(prefix))
				sequenceIndex = prefix;

		sequenceCurrent = metaOptions.currentAssetURL.pathname;
	} else {
		let savedIndexKey = metaOptions.assetSavedIndexKey;
		let savedIndex = localStorage.getItem(savedIndexKey);
		if (   savedIndex == null
			&& options.randomize) {
			sequenceIndex = rollDie(1E6);
			localStorage.setItem(savedIndexKey, sequenceIndex);
		} else if (options.sequence.startsWith("next")) {
			sequenceIndex = savedIndex == null
							? 1
							: parseInt(savedIndex) + 1;
			localStorage.setItem(savedIndexKey, sequenceIndex);
		} else {
			sequenceIndex = savedIndex == null
							? 0
							: parseInt(savedIndex) - 1;
			localStorage.setItem(savedIndexKey, sequenceIndex);
		}

		sequenceCurrent = null;
	}

	return { sequenceIndex, sequenceCurrent };
}

/*****************************************************************************/
/*  Return an asset pathname (not versioned), given a pathname regular
	expression pattern (in string form, not a RegExp object), with ‘%R’ where
	a number should be, e.g.:

        /static/img/logo/christmas/light/logo-christmas-light-%R(\\.svg|-small-1x\\.(png|jpg|webp))

    will return files with pathnames like:

        /static/img/logo/christmas/light/logo-christmas-light-1-small-1x.png
        /static/img/logo/christmas/light/logo-christmas-light-1-small-1x.jpg
        /static/img/logo/christmas/light/logo-christmas-light-1-small-1x.webp
		/static/img/logo/christmas/light/logo-christmas-light-1.svg

    (Or -2, -3, etc.)

    Specified assets must be listed in the versioned asset database.

	By default, selects uniform-randomly from all available asset pathnames
	matching the provided pattern. (But see option fields, below.)

	Available option fields:

	sequenceIndex (integer)
	sequenceIndex (string)
		If this field is set to an integer value, then, instead of returning a
		random asset pathname out of the asset pathnames matching the provided
		pattern, selects the i’th one, where i is equal to (sequenceIndex - 1)
		modulo the number of matching asset pathnames.

		If this field is set to a string value, then it must be either “next”
		or “previous”, and the `sequenceCurrent` field must also be set; if
		these conditions are not met, null is returned. (See the
		`sequenceCurrent` field, below, for details on this option.)

	sequenceCurrent (string)
		If the `sequenceIndex` field is not set to a string value of either
		“next” or “previous”, this field is ignored.

		If `sequenceIndex` is set to “next”, and the value of this field is
		equal to a value of one of the asset pathnames that match the provided
		pattern, then the next pattern in the set of matching patterns is
		returned (wrapping around to the first value after the last one).

		If `sequenceIndex` is set to “previous”, and the value of this field
		is equal to a value of one of the asset pathnames that match the
		provided pattern, then the previous pattern in the set of matching
		patterns is returned (wrapping around to the last value after the
		first).

		If the value of this field does not match any of the asset pathnames
		that match the provided pattern (including if it is null), then, if
		`sequenceIndex` is set to “next”, it behaves as if `sequenceIndex` had
		been set to 1; and if `sequenceIndex` is set to “previous”, it behaves
		as if `sequenceIndex` had been set to 0 (i.e., the first or the last
		pattern in the set of matching patterns is returned).
 */
function getAssetPathname(assetPathnamePattern, options) {
	options = Object.assign({
		sequenceIndex: null,
		sequenceCurrent: null
	}, options);

    let assetPathnameRegExp = new RegExp(assetPathnamePattern.replace("%R", "[0-9]+"));
    let matchingAssetPathnames = [ ];
    for (versionedAssetPathname of Object.keys(GW.assetVersions)) {
        if (assetPathnameRegExp.test(versionedAssetPathname))
            matchingAssetPathnames.push(versionedAssetPathname);
    }

	if (matchingAssetPathnames.length == 0) {
		return null;
	} else if (options.sequenceIndex == null) {
		return matchingAssetPathnames[rollDie(matchingAssetPathnames.length) - 1];
	} else if (typeof options.sequenceIndex == "number") {
		return matchingAssetPathnames[modulo(options.sequenceIndex - 1, matchingAssetPathnames.length)];
	} else if (typeof options.sequenceIndex == "string") {
		if ([ "next", "previous" ].includes(options.sequenceIndex) == false)
			return null;

		let currentIndex = matchingAssetPathnames.indexOf(options.sequenceCurrent);
		if (currentIndex == -1) {
			return (options.sequenceIndex == "next"
					? matchingAssetPathnames.first
					: matchingAssetPathnames.last);
		} else {
			return (options.sequenceIndex == "next"
					? matchingAssetPathnames[modulo(currentIndex + 1, matchingAssetPathnames.length)]
					: matchingAssetPathnames[modulo(currentIndex - 1, matchingAssetPathnames.length)]);
		}
	} else {
		return null;
	}
}


/*******************/
/* IMAGE OUTLINING */
/*******************/

GW.outlineOrNot = { };
GW.outlineOrNotAPIEndpoint = "https://api.obormot.net/outlineornot/url";

/******************************************************************************/
/*	Returns true if the given image’s outlining status has been set (i.e., if
	it has one of the classes [ "outline", "outline-auto", "outline-not",
	"outline-not-auto" ]), false otherwise.
 */
function outliningJudgmentHasBeenAppliedToImage(image) {
	return (image.classList.containsAnyOf([ "outline", "outline-auto", "outline-not", "outline-not-auto" ]) == true);
}

/*****************************************************************************/
/*  Returns true if the given image should be outlined (i.e., the outlineOrNot
	API has judged this image to be outline-requiring), false if the image
	should not be outlined (i.e., the outlineOrNot API has judged this image
	to be non-outline-requiring, null if no judgment is available.
 */
function outliningJudgmentForImage(image) {
    return (GW.outlineOrNot[Images.smallestAvailableImageSizeURLForImage(image).href]?.outline ?? null);
}

/*****************************************************************************/
/*	Applies available (i.e., requested and received from the outlineOrNot API)
	image outlining judgment data to the given image, and returns true if this
	was done successfully. If no such data is available for the given image,
	does nothing (and returns false). Likewise does nothing (and returns null)
	for images which already have their outlining status specified.
 */
function applyImageOutliningJudgment(image) {
	if (outliningJudgmentHasBeenAppliedToImage(image))
		return null;

	let outliningJudgment = outliningJudgmentForImage(image);
	if (outliningJudgment != null) {
		image.classList.add(outliningJudgment == true ? "outline-auto" : "outline-not-auto");
		return true;
	} else {
		return false;
	}
}

/*****************************************************************************/
/*  Sends request to outlineOrNot for judgments about whether the images in the
    given container ought to be outlined.
 */
function requestImageOutliningJudgmentsForImagesInContainer(container) {
	/*	Disable, for now.
			—SA 2024-12-18
	 */
	return;

    let imageURLs = Array.from(container.querySelectorAll("figure img")).map(image => {
    	let imageURL = Images.smallestAvailableImageSizeURLForImage(image);
        return (   imageURL.pathname.match(/\.(png|jpe?g$)/i)
        		&& GW.invertOrNot[imageURL.href] == null)
        	   ? imageURL.href
        	   : null;
    }).filter(x => x);
    if (imageURLs.length == 0)
        return;

    doAjax({
        location: GW.outlineOrNotAPIEndpoint,
        method: "POST",
        serialization: "JSON",
        responseType: "json",
        params: imageURLs,
        onSuccess: (event) => {
            event.target.response.forEach(imageInfo => {
                GW.outlineOrNot[imageInfo.url] = {
                    outline: (imageInfo.outline == 1)
                };
            });

			GW.notificationCenter.fireEvent("GW.imageOutliningJudgmentsAvailable", { judgments: event.target.response });
        },
        onFailure: (event) => {
            console.log(event);
        }
    });
}


/*******************/
/* IMAGE INVERSION */
/*******************/

GW.invertOrNot = { };
GW.invertOrNotAPIEndpoint = "https://invertornot.com/api/url";

/******************************************************************************/
/*	Returns true if the given image’s inversion status has been set (i.e., if
	it has one of the classes [ "invert", "invert-auto", "invert-not",
	"invert-not-auto" ]), false otherwise.
 */
function inversionJudgmentHasBeenAppliedToImage(image) {
	return (image.classList.containsAnyOf([ "invert", "invert-auto", "invert-not", "invert-not-auto" ]) == true);
}

/****************************************************************************/
/*  Returns true if the given image should be inverted in dark mode (i.e.,
	the invertOrNot API has judged this image to be invertible), false if the
	image should not be inverted (i.e., the invertOrNot API has judged this
	image to be non-invertible, null if no judgment is available.
 */
function inversionJudgmentForImage(image) {
    return (GW.invertOrNot[Images.smallestAvailableImageSizeURLForImage(image).href]?.invert ?? null);
}

/*****************************************************************************/
/*	Applies available (i.e., requested and received from the invertOrNot API)
	image inversion judgment data to the given image, and returns true if this
	was done successfully. If no such data is available for the given image,
	does nothing (and returns false). Likewise does nothing (and returns null)
	for images which already have their inversion status specified.
 */
function applyImageInversionJudgment(image) {
	if (inversionJudgmentHasBeenAppliedToImage(image))
		return null;

	let inversionJudgment = inversionJudgmentForImage(image);
	if (inversionJudgment != null) {
		image.classList.add(inversionJudgment == true ? "invert-auto" : "invert-not-auto");
		return true;
	} else {
		return false;
	}
}

/*****************************************************************************/
/*  Sends request to invertOrNot for judgments about whether the images in the
    given container ought to be inverted.
 */
function requestImageInversionJudgmentsForImagesInContainer(container) {
    let imageURLs = Array.from(container.querySelectorAll("figure img")).map(image => {
    	let imageURL = Images.smallestAvailableImageSizeURLForImage(image);
        return (   imageURL.pathname.match(/\.(png|jpe?g$)/i)
        		&& GW.invertOrNot[imageURL.href] == null)
        	   ? imageURL.href
        	   : null;
    }).filter(x => x);
    if (imageURLs.length == 0)
        return;

    doAjax({
        location: GW.invertOrNotAPIEndpoint,
        method: "POST",
        serialization: "JSON",
        responseType: "json",
        params: imageURLs,
        onSuccess: (event) => {
            event.target.response.forEach(imageInfo => {
                GW.invertOrNot[imageInfo.url] = {
                    invert: (imageInfo.invert == 1)
                };
            });

			GW.notificationCenter.fireEvent("GW.imageInversionJudgmentsAvailable", { judgments: event.target.response });
        },
        onFailure: (event) => {
            console.log(event);
        }
    });
}


/**********/
/* IMAGES */
/**********/

Images = {
    thumbnailBasePath: "/metadata/thumbnail/",

    thumbnailDefaultSize: "256",

	thumbnailSizeFromURL: (url) => {
		if (typeof url == "string")
			url = URLFromString(url);

		return parseInt(url.pathname.slice(Images.thumbnailBasePath.length).split("/")[0]);
	},

	smallestAvailableImageSizeURLForImage: (image) => {
		return (Images.thumbnailURLForImage(image) ?? Images.fullSizeURLForImage(image));
	},

	fullSizeURLForImage: (image) => {
		return URLFromString(image.dataset.srcSizeFull ?? image.src);
	},

    thumbnailURLForImageURL: (imageSrcURL, size = Images.thumbnailDefaultSize) => {
        if (imageSrcURL.hostname != location.hostname)
            return null;

        return URLFromString(  Images.thumbnailBasePath
                             + size + "px/"
                             + fixedEncodeURIComponent(fixedEncodeURIComponent(imageSrcURL.pathname)));
    },

    thumbnailURLForImage: (image, size = Images.thumbnailDefaultSize) => {
		if (Images.isSVG(image))
			return null;

        return (Images.isThumbnail(image)
        		? URLFromString(image.src)
        		: Images.thumbnailURLForImageURL(URLFromString(image.src)));
    },

    thumbnailifyImage: (image) => {
		if (Images.isSVG(image))
			return;

    	if (Images.isThumbnail(image))
    		return;

        let thumbnailURL = Images.thumbnailURLForImage(image);
        if (thumbnailURL) {
            image.dataset.srcSizeFull = image.src;
            image.src = thumbnailURL.href;
        }
    },

	isSVG: (image) => {
		return (URLFromString(image.src).pathname.toLowerCase().endsWith(".svg"));
	},

	isThumbnail: (image) => {
		return (image.dataset.srcSizeFull > "");
	},

	unthumbnailifyImage: (image) => {
		if (Images.isThumbnail(image)) {
			image.src = image.dataset.srcSizeFull;
			delete image.dataset.srcSizeFull;
		}
	}
};


/***********************/
/* PROGRESS INDICATORS */
/***********************/

/**************************************************************************/
/*	Returns SVG source for a progress-indicator SVG icon, given a specified
	progress percentage (in [0,100]).
 */
function arcSVGForProgressPercent (percent) {
	let svgOpeningTagSrc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`;
	let svgClosingTagSrc = `</svg>`;

	let strokeWidth = GW.isMobile() ? 64.0 : 56.0;
	let boxRadius = 256.0;
	let radius = boxRadius - (strokeWidth * 0.5);

	let backdropCircleGray = (GW.isMobile() ? 110.0 : 170.0) + (percent * 0.64);
	let backdropCircleColor = Color.hexStringFromRGB({
		red: backdropCircleGray,
		green: backdropCircleGray,
		blue: backdropCircleGray
	});
	let backdropCircleSrc = `<circle cx="${boxRadius}" cy="${boxRadius}" r="${radius}"`
						  + ` stroke-width="${strokeWidth}" stroke="${backdropCircleColor}" fill="none"/>`;

	let arcAttributesSrc = `fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round"`;
	let arcSrc;
	if (percent == 100) {
		arcSrc = `<circle cx="${boxRadius}" cy="${boxRadius}" r="${radius}" ${arcAttributesSrc}/>`;
	} else {
		let angle = 2.0 * Math.PI * ((percent / 100.0) - 0.25);
		let y = (radius * Math.sin(angle)) + boxRadius;
		let x = (radius * Math.cos(angle)) + boxRadius;
		let largeArc = percent > 50 ? "1" : "0";
		arcSrc = `<path
				   d="M ${boxRadius} ${strokeWidth * 0.5} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y}"
				   ${arcAttributesSrc}/>`;
	}

	return (svgOpeningTagSrc + backdropCircleSrc + arcSrc + svgClosingTagSrc);
}

/*****************************************************************************/
/*	Given an element with a `data-progress-percentage` attribute, injects an
	inline icon displaying the specified progress percentage. (The icon will
	automatically be further processed for display by the inline icon system.)
 */
function renderProgressPercentageIcon(progressIndicator) {
	let svgSrc = arcSVGForProgressPercent(parseInt(progressIndicator.dataset.progressPercentage));
	progressIndicator.querySelector(".progress-indicator-icon")?.remove();
	progressIndicator.appendChild(newElement("SPAN", {
		class: "progress-indicator-icon icon-special",
		style: `--icon-url: url("data:image/svg+xml;utf8,${encodeURIComponent(svgSrc)}")`
	}));
}


/*************/
/* DOCUMENTS */
/*************/

/*  Return the location (URL) associated with a document.
    (Document|DocumentFragment) => URL
 */
function baseLocationForDocument(doc) {
	if (doc == null) {
		return null;
	} else if (doc == document) {
        return URLFromString(location.href);
    } else if (doc.baseLocation) {
        return URLFromString(doc.baseLocation.href);
    } else {
        return null;
    }
}


/*********/
/* LINKS */
/*********/

/******************************************************************************/
/*  Returns true if the link is an annotated link, OR if it is an include-link
    which transclude.js treats as an annotation transclude. (This is relevant
    because in either case, the link hash should be ignored, when deciding what
    to do with a link on the basis of it having or not having a link hash.)
 */
function isAnnotationLink(link) {
    return (Annotations.isAnnotatedLinkFull(link) || Transclude.isAnnotationTransclude(link));
}

/****************************************************************************/
/*  Return the element, in the target document, pointed to by the hash of the
    given link (which may be a URL object or an HTMLAnchorElement).
 */
function targetElementInDocument(link, doc) {
    if (isAnchorLink(link) == false)
        return null;

    let anchor = anchorsForLink(link)[0];
    let element = null;

    if (anchor.startsWith("#"))
        element = doc.querySelector(selectorFromHash(anchor));

    if (   element == null
        && link instanceof HTMLAnchorElement
        && link.dataset.backlinkTargetUrl > "") {
        //  HAX. (Remove when link IDs are fixed. —SA 2023-03-22)
        /*  Disabling this hack, hopefully it’s no longer needed.
            (See also line below.) —SA 2023-04-29
         */
//      let exactBacklinkSelector = null;
//      if (anchor.startsWith("#gwern")) {
//          let targetID = "#" + anchor.slice(("#gwern" + link.dataset.backlinkTargetUrl.slice(1).replace("/", "-") + "-").length);
//          if (targetID > "")
//              exactBacklinkSelector = `a[href*='${CSS.escape(link.dataset.backlinkTargetUrl + targetID)}']`;
//      }

        let backlinkSelector = `a[href*='${CSS.escape(link.dataset.backlinkTargetUrl)}']:not(.backlink-not)`;
        let exclusionSelector = [
            "#page-metadata a",
            ".aux-links-list a"
        ].join(", ");
        /*  Disabling this hack, hopefully it’s no longer needed.
            (See also lines above.) —SA 2023-04-29
         */
        element = /* doc.querySelector(exactBacklinkSelector) ?? */ (Array.from(doc.querySelectorAll(backlinkSelector)).filter(backlink => {
            return (   (link.dataset.backlinkTargetUrl.startsWith("/")
                        ? backlink.pathname == link.dataset.backlinkTargetUrl
                        : backlink.href == link.dataset.backlinkTargetUrl)
                    && backlink.closest(exclusionSelector) == null);
        }).first);
    }

    return element;
}

/*****************************************************************************/
/*  Returns true if the given link (a URL or an HTMLAnchorElement) points to a
    specific element within a page, rather than to a whole page. (This is
    usually because the link has a URL hash, but may also be because the link
    is a backlink, in which case it implicitly points to that link in the
    target page which points back at the target page for the backlink; or it
    may be because the link is a link with a value for the `data-target-id`
    or `data-backlink-target-url` attributes.)
 */
function isAnchorLink(link) {
    return (anchorsForLink(link).length == 1);
}

/***********************************************/
/*  Removes all anchor data from the given link.
 */
function stripAnchorsFromLink(link) {
    if (link instanceof HTMLAnchorElement) {
        link.removeAttribute("data-target-id");
        link.removeAttribute("data-backlink-target-url");
    }

    link.hash = "";
}

/****************************************************************************/
/*  Returns an array of anchors for the given link. This array may have zero,
    one, or two elements.
 */
function anchorsForLink(link) {
    if (link instanceof HTMLAnchorElement) {
        if (link.dataset.targetId > "") {
            return link.dataset.targetId.split(" ").map(x => `#${x}`);
        } else if (   isAnnotationLink(link) == false
                   && link.hash > "") {
            return link.hash.match(/#[^#]*/g);
        } else if (   isAnnotationLink(link) == false
                   && link.dataset.backlinkTargetUrl > "") {
            return [ link.dataset.backlinkTargetUrl ];
        } else {
            return [ ];
        }
    } else {
         return link.hash.match(/#[^#]*/g) ?? [ ];
    }
}


/************/
/* SECTIONS */
/************/

/******************************************************************************/
/*  Returns the heading level of a <section> element. (Given by a class of the
    form ‘levelX’ where X is a positive integer. Defaults to 1 if no such class
    is present.)
 */
function sectionLevel(section) {
    if (  !section
        || section.tagName != "SECTION")
        return null;

    //  Note: ‘m’ is a regexp matches array.
    let m = Array.from(section.classList).map(c => c.match(/^level([0-9]*)$/)).find(m => m);
    return (m ? parseInt(m[1]) : 1);
}


/*************/
/* CLIPBOARD */
/*************/

/*******************************************/
/*  Copy the provided text to the clipboard.
 */
function copyTextToClipboard(text) {
    let scratchpad = document.querySelector("#scratchpad");

    //  Perform copy operation.
    scratchpad.innerText = text;
    selectElementContents(scratchpad);
    document.execCommand("copy");
    scratchpad.innerText = "";
}

/***************************************************/
/*  Create scratchpad for synthetic copy operations.
 */
doWhenDOMContentLoaded(() => {
    document.body.append(newElement("SPAN", { "id": "scratchpad" }));
});

/*****************************************************************************/
/*  Adds the given copy processor, appending it to the existing array thereof.

    Each copy processor should take two arguments: the copy event, and the
    DocumentFragment which holds the selection as it is being processed by each
    successive copy processor.

    A copy processor should return true if processing should continue after it’s
    done, false otherwise (e.g. if it has entirely replaced the contents of the
    selection object with what the final clipboard contents should be).
 */
function addCopyProcessor(processor) {
    if (GW.copyProcessors == null)
        GW.copyProcessors = [ ];

    GW.copyProcessors.push(processor);
}

/******************************************************************************/
/*  Set up the copy processor system by registering a ‘copy’ event handler to
    call copy processors. (Must be set up for the main document, and separately
    for any shadow roots.)
 */
function registerCopyProcessorsForDocument(doc) {
    GWLog("registerCopyProcessorsForDocument", "misc.js", 1);

    doc.addEventListener("copy", (event) => {
        if (   GW.copyProcessors == null
            || GW.copyProcessors.length == 0)
            return;

        event.preventDefault();
        event.stopPropagation();

        let selection = getSelectionAsDocument(doc);

        let i = 0;
        while (   i < GW.copyProcessors.length
               && GW.copyProcessors[i++](event, selection));

        event.clipboardData.setData("text/plain", selection.textContent);
        event.clipboardData.setData("text/html", selection.innerHTML);
    });
}


/*************/
/* AUX-LINKS */
/*************/

AuxLinks = {
    auxLinksLinkTypes: {
        "/metadata/annotation/backlink/":           "backlinks",
        "/metadata/annotation/similar/":            "similars",
        "/metadata/annotation/link-bibliography/":  "link-bibliography"
    },

    auxLinksLinkType: (link) => {
        for (let [ pathnamePrefix, linkType ] of Object.entries(AuxLinks.auxLinksLinkTypes))
            if (link.pathname.startsWith(pathnamePrefix))
                return linkType;

        return null;
    },

    /*  Page or document for whom the aux-links are.
     */
    targetOfAuxLinksLink: (link) => {
        for (let [ pathnamePrefix, linkType ] of Object.entries(AuxLinks.auxLinksLinkTypes)) {
            if (link.pathname.startsWith(pathnamePrefix)) {
                if (link.pathname.endsWith(".html")) {
                    let start = pathnamePrefix.length;
                    let end = (link.pathname.length - ".html".length);
                    return decodeURIComponent(decodeURIComponent(link.pathname.slice(start, end)));
                } else {
                    let start = (pathnamePrefix.length - 1);
                    return link.pathname.slice(start);
                }
            }
        }

        return null;
    }
};


/*********/
/* NOTES */
/*********/

Notes = {
	hashForCitationRegexp: new RegExp("^#fnref[0-9]+$"),

	hashMatchesCitation: (hash = location.hash) => {
		return Notes.hashForCitationRegexp.test(hash);
	},

	hashForFootnoteRegexp: new RegExp("^#fn[0-9]+$"),

	hashMatchesFootnote: (hash = location.hash) => {
		return Notes.hashForFootnoteRegexp.test(hash);
	},

	hashForSidenoteRegexp: new RegExp("^#sn[0-9]+$"),

	hashMatchesSidenote: (hash = location.hash) => {
		return Notes.hashForSidenoteRegexp.test(hash);
	},

    /*  Get the (side|foot)note number from a URL hash (which might point to a
        footnote, a sidenote, or a citation).
     */
    noteNumberFromHash: (hash = location.hash) => {
        if (   Notes.hashMatchesFootnote(hash)
        	|| Notes.hashMatchesSidenote(hash))
            return hash.substr(3);
        else if (Notes.hashMatchesCitation(hash))
            return hash.substr(6);
        else
            return "";
    },

    noteNumber: (element) => {
        return Notes.noteNumberFromHash(element.hash ?? ("#" + element.id));
    },

    citationIdForNumber: (number) => {
        return `fnref${number}`;
    },

    footnoteIdForNumber: (number) => {
        return `fn${number}`;
    },

    sidenoteIdForNumber: (number) => {
        return `sn${number}`;
    },

    setCitationNumber: (citation, number) => {
        //  #fnN
        citation.hash = citation.hash.slice(0, 3) + number;

        //  fnrefN
        citation.id = citation.id.slice(0, 5) + number;

        //  Link text.
        citation.firstElementChild.textContent = number;
    },

    setFootnoteNumber: (footnote, number) => {
        //  fnN
        footnote.id = footnote.id.slice(0, 2) + number;

        //  #fnrefN
        let footnoteBackLink = footnote.querySelector("a.footnote-back");
        if (footnoteBackLink) {
            footnoteBackLink.hash = footnoteBackLink.hash.slice(0, 6) + number;
        }

        //  #fnN
        let footnoteSelfLink = footnote.querySelector("a.footnote-self-link");
        if (footnoteSelfLink) {
            footnoteSelfLink.hash = footnoteSelfLink.hash.slice(0, 3) + number;
            footnoteSelfLink.title = "Link to footnote " + number;
        }

        //  Footnote backlinks.
        let backlinksListLabelLink = footnote.querySelector(".section-backlinks .backlinks-list-label a");
        if (backlinksListLabelLink) {
            //  #fnN
            backlinksListLabelLink.hash = backlinksListLabelLink.hash.slice(0, 3) + number;

            //  N
            backlinksListLabelLink.querySelector("span.footnote-number").innerText = number;
        }
    },

    /**************************************************************************/
    /*  Return all {side|foot}note elements associated with the given citation.
     */
    allNotesForCitation: (citation) => {
        if (!citation.classList.contains("footnote-ref"))
            return null;

        let citationNumber = Notes.noteNumber(citation);
        let selector = `#fn${citationNumber}, #sn${citationNumber}`;

        let allNotes = Array.from(document.querySelectorAll(selector)
                       ).concat(Array.from(citation.getRootNode().querySelectorAll(selector))
                       ).concat(Extracts.popFrameProvider.allSpawnedPopFrames().flatMap(popFrame =>
                                    Array.from(popFrame.document.querySelectorAll(selector)))
                       ).unique();
        /*  We must check to ensure that the note in question is from the same
            page as the citation (to distinguish between main document and any
            full-page embeds that may be spawned).
         */
        return allNotes.filter(note => (note.querySelector(".footnote-back")?.pathname == citation.pathname));
    }
};


/****************/
/* MARGIN NOTES */
/****************/

GW.marginNotes = {
    //  Don’t show margin notes block if there are fewer notes than this.
    minimumAggregatedNotesCount: 3,

    aggregationNeededInDocuments: [ ]
};

/****************************************************************************/
/*  Aggregate margin notes, on the next animation frame, if not already done.
 */
function aggregateMarginNotesIfNeededInDocument(doc) {
    if (GW.marginNotes.aggregationNeededInDocuments.includes(doc) == false)
        GW.marginNotes.aggregationNeededInDocuments.push(doc);

    requestAnimationFrame(() => {
        if (GW.marginNotes.aggregationNeededInDocuments.includes(doc) == false)
            return;

        GW.marginNotes.aggregationNeededInDocuments.remove(doc);

        aggregateMarginNotesInDocument(doc);
    });
}

/**************************/
/*  Aggregate margin notes.
 */
function aggregateMarginNotesInDocument(doc) {
    GWLog("aggregateMarginNotesInDocument", "misc.js", 2);

    let marginNotesBlockClass = "margin-notes-block";

    doc.querySelectorAll(".marginnote").forEach(marginNote => {
        if (marginNote.classList.contains("only-icon"))
            return;

        let section = marginNote.closest("section, .markdownBody, .annotation-abstract");
        if (section == null)
            return;

        let marginNotesBlock = section.querySelector(`#${(CSS.escape(section.id))}-${marginNotesBlockClass}`);
        if (marginNotesBlock == null) {
            /*  Construct the margin notes block. It should go after any
                abstract and/or epigraph that opens the section.
             */
            let firstBlock = firstBlockOf(section, {
                alsoSkipElements: [
                    ".abstract blockquote",
                    ".epigraph",
                    "p.data-field"
                ]
            }, true);

            let marginNoteBlockContainerElementsSelector = [
                "section",
                ".markdownBody",
                ".abstract-collapse:not(.abstract)",
                ".collapse-content-wrapper",
                ".annotation-abstract"
            ].join(", ");
            while (firstBlock.parentElement.matches(marginNoteBlockContainerElementsSelector) == false)
                firstBlock = firstBlock.parentElement;

            //  Inject the margin notes block.
            marginNotesBlock = newElement("P", {
                class: marginNotesBlockClass,
                id: `${section.id}-${marginNotesBlockClass}`
            });
            firstBlock.parentElement.insertBefore(marginNotesBlock, firstBlock);
        }

        //  Clone the note.
        let clonedNote = marginNote.cloneNode(true);

        //  Set margin note type class.
        clonedNote.swapClasses([ "inline", "sidenote" ], 0);

        //  Unwrap the inner wrapper (unneeded here).
        unwrap(clonedNote.querySelector(".marginnote-inner-wrapper"));

        //  Remove dropcap, if any.
        resetDropcapInBlock(clonedNote);

        //  Trim whitespace.
        clonedNote.innerHTML = clonedNote.innerHTML.trim();

        //  Strip brackets.
        /*  Reason: we use brackets for editorial insertions & commentary,
            particularly in annotations where the reader assumes the text is
            written by the original authors.
                Sometimes in long annotations where we wish to add ‘sections’
            (because the original didn’t have them or they were inappropriate,
            eg. long journalistic essays where the material is scattered rather
            than organized by topic as necessary for a convenient annotation),
            we use margin-notes as a substitute for original sections.
            Such editorializing of course must be marked by brackets to avoid
            misleading the reader; but then, when aggregated at the beginning
            of the annotation like all margin notes, it looks bad:
            ‘[Foo] · [Bar] · [Baz] · [Quux]’.
                So, although it risks misleading readers who do not read down
            to the actual margin-note usage & see that it’s an editorial
            insertion, we remove the brackets when aggregated.
                (If it is necessary to override this feature & force brackets
            displayed in aggregates - perhaps because the margin-note is some
            exotic chemical name that starts with a bracket - one can use
            alternate Unicode bracket-pairs, or possibly some sort of
            non-printing non-whitespace character to block the match.
            Although, since the match requires the text to both start *and* end
            with a bracket, this should be an extremely rare edge-case not
            worth thinking about further.)
         */
        if (   clonedNote.textContent.startsWith("[")
            && clonedNote.textContent.endsWith("]")) {
            clonedNote.firstTextNode.nodeValue = clonedNote.firstTextNode.nodeValue.slice(1);
            clonedNote.lastTextNode.nodeValue = clonedNote.lastTextNode.nodeValue.slice(0, -1);
        }

        //  Strip trailing period.
        if (clonedNote.textContent.endsWith("."))
            clonedNote.lastTextNode.nodeValue = clonedNote.lastTextNode.nodeValue.slice(0, -1);

        //  Prevent duplication.
        if (Array.from(marginNotesBlock.children).findIndex(child => {
                return clonedNote.textContent == child.textContent;
            }) != -1)
            return;

        //  Append.
        marginNotesBlock.append(clonedNote);

        //  Process the new entries to activate pop-frame spawning.
        Extracts.addTargetsWithin(marginNotesBlock);
    });

    //  Update visibility of margin note blocks.
    doc.querySelectorAll(`.${marginNotesBlockClass}`).forEach(marginNotesBlock => {
        marginNotesBlock.classList.toggle("hidden", marginNotesBlock.children.length < GW.marginNotes.minimumAggregatedNotesCount);
    });
}

/***************************************************************************/
/*  Child nodes of a paragraph, excluding any margin notes in sidenote mode.
 */
function nodesOfGraf(graf) {
    return Array.from(graf.childNodes).filter(node => ((node instanceof Element && node.matches(".marginnote.sidenote")) == false));
}

/*****************************************************************************/
/*  Text content of a paragraph, excluding the contents of any margin notes in
    sidenote mode.
 */
function textContentOfGraf(graf) {
    return nodesOfGraf(graf).map(node => node.textContent).join("");
}

/******************************************************************************/
/*  First text node of a paragraph, skipping any margin notes in sidenote mode.
 */
function firstTextNodeOfGraf(graf) {
    return nodesOfGraf(graf).first.firstTextNode;
}


/*********************/
/* TABLE OF CONTENTS */
/*********************/

GW.TOC = {
    containersToUpdate: [ ]
};

/*********************************************************************/
/*  Update page TOC, on the next animation frame, if not already done.
 */
function updatePageTOCIfNeeded(container = document) {
    if (container == document) {
        GW.TOC.containersToUpdate = [ document ];
    } else if (GW.TOC.containersToUpdate.includes(container) == false) {
        GW.TOC.containersToUpdate.push(container);
    }

    requestAnimationFrame(() => {
        while (GW.TOC.containersToUpdate.length > 0)
            updatePageTOC(GW.TOC.containersToUpdate.shift());
    });
}

/*****************************************************************************/
/*  Updates the page TOC with any sections in the page that don’t already have
    TOC entries.
 */
//  Called by: updateMainPageTOC (rewrite.js)
//  Called by: includeContent (transclude.js)
function updatePageTOC(container = document) {
    GWLog("updatePageTOC", "misc.js", 2);

    let TOC = document.querySelector("#TOC");
    if (!TOC)
        return;

    //  Don’t nest TOC entries any deeper than this.
    let maxNestingDepth = 4;

    //  Collect new entries, for later processing (if need be).
    let newEntries = [ ];

    container.querySelectorAll("#markdownBody section").forEach(section => {
        //  If this section already has a TOC entry, return.
        if (TOC.querySelector(`a[href$='#${(CSS.escape(fixedEncodeURIComponent(section.id)))}']`) != null)
            return;

        //  If this section is too deeply nested, do not add it.
        if (sectionLevel(section) > maxNestingDepth)
            return;

        /*  Find where to insert the new TOC entry.
            Any already-existing <section> should have a TOC entry.
            (Unless the TOC entry has been removed or is missing for some reason,
             in which case use the entry for the section after that, and so on.)
         */
        let parentSection = section.parentElement.closest("section") ?? document.querySelector("#markdownBody");
        let parentTOCElement = parentSection.id == "markdownBody"
                               ? TOC
                               : TOC.querySelector(`#toc-${(CSS.escape(parentSection.id))}`).closest("li");

        let nextSection = null;
        let nextSectionTOCLink = null;
        let followingSections = childBlocksOf(parentSection).filter(child =>
               child.tagName == "SECTION"
            && child.compareDocumentPosition(section) == Node.DOCUMENT_POSITION_PRECEDING
        );
        do {
            nextSection = followingSections.shift();
            nextSectionTOCLink = nextSection
                                 ? parentTOCElement.querySelector(`#toc-${(CSS.escape(nextSection.id))}`)
                                 : null;
        } while (   nextSection
                 && nextSectionTOCLink == null);
        let followingTOCElement = nextSectionTOCLink
                                  ? nextSectionTOCLink.closest("li")
                                  : null;

        //  Construct entry.
        let entry = newElement("LI");
        let entryText = section.id == "footnotes"
                        ? "Footnotes"
                        : section.firstElementChild.querySelector("a").innerHTML;
        entry.innerHTML = `<a
                            class='decorate-not'
                            id='toc-${section.id}'
                            href='#${fixedEncodeURIComponent(section.id)}'
                                >${entryText}</a>`;

        //  Get or construct the <ul> element.
        let subList = (   Array.from(parentTOCElement.childNodes).find(child => child.tagName == "UL")
                       ?? parentTOCElement.appendChild(newElement("UL")));

        //  Insert and store.
        subList.insertBefore(entry, followingTOCElement);
        newEntries.push(entry);
    });

    //  Process the new entries to activate pop-frame spawning.
    newEntries.forEach(Extracts.addTargetsWithin);

    //  Rectify typography in new entries.
    newEntries.forEach(entry => {
        Typography.processElement(entry, Typography.replacementTypes.WORDBREAKS);
    });

    //  Update visibility.
    updateTOCVisibility(TOC);
}


/*************/
/* FOOTNOTES */
/*************/

/*****************************************************************************/
/*  Mark hash-targeted footnote with ‘targeted’ class.
 */
function updateFootnoteTargeting() {
    GWLog("updateFootnoteTargeting", "misc.js", 1);

    if (   Sidenotes
        && Sidenotes.mediaQueries.viewportWidthBreakpoint.matches)
        return;

    //  Clear any existing targeting.
    let targetedElementSelector = [
        ".footnote-ref",
        ".footnote"
    ].map(x => x + ".targeted").join(", ");
    document.querySelectorAll(targetedElementSelector).forEach(element => {
        element.classList.remove("targeted");
    });

    //  Identify and mark target footnote.
    let target = location.hash.match(/^#(fn|fnref)[0-9]+$/)
                 ? getHashTargetedElement()
                 : null;
    if (target)
        target.classList.add("targeted");
}


/*************/
/* DROPCAPS */
/*************/

GW.dropcaps = {
    dropcapBlockSelector: "p[class*='dropcap-']:not(.dropcap-not)",

    graphicalDropcapTypes: [
        "dropcat",
        "gene-wolfe",
        "ninit"
    ]
};

/***************************************************************************/
/*  Returns URL of a graphical dropcap of the given type and letter,
    appropriate for the current mode and the viewport’s device pixel ratio.

	For an explanation of the available option fields, see the
	`injectSpecialPageLogo()` function in special-occasions.js.
 */
function getDropcapURL(dropcapType, letter, options) {
	options = Object.assign({
		mode: DarkMode.computedMode(),
		identifier: null,
		randomize: true,
		sequence: null
	}, options);

	//	Identifier string (empty, or hyphen plus a number, or “-%R”).
    let dropcapIdentifierRegexpString = ``;
    if (options.identifier) {
    	dropcapIdentifierRegexpString = `-${options.identifier}`;
    } else if (   options.randomize == true
    		   || GW.allowedAssetSequencingModes.includes(options.sequence)) {
    	dropcapIdentifierRegexpString = `-%R`;
    }

	/*	Bitmap files come in several scales (for different pixel densities of
		display); SVGs are singular.
	 */
    let scale = valMinMax(Math.ceil(window.devicePixelRatio), 1, 2);
    let fileFormatRegexpSuffix = `(\\.svg|-small-${scale}x\\.(png|jpg|webp))$`;

	/*	File name pattern further depends on whether we have separate light
		and dark dropcaps of this sort.
	 */
	let dropcapPathnamePattern = `/static/font/dropcap/${dropcapType}/`
							   + (options.mode
							      ? `(${options.mode}/)?`
							      : ``)
							   + letter.toUpperCase()
							   + `(-.+)?`
							   + dropcapIdentifierRegexpString
							   + fileFormatRegexpSuffix;
    let dropcapPathname = getAssetPathname(dropcapPathnamePattern, processAssetSequenceOptions(options, {
    	assetSavedIndexKey: `dropcap-sequence-index-${dropcapType}`
    }));
    if (dropcapPathname == null)
        return null;

    return versionedAssetURL(dropcapPathname);
}

/*****************************************************************************/
/*  Reset dropcap in the given block to initial state (as it was prior to the
    handlers in this section being run, i.e. not implemented, only marked for
    implementation).

    This function is also used to strip dropcaps from blocks that shouldn’t
    have them in the first place.
 */
function resetDropcapInBlock(block) {
    let dropcapLink = block.querySelector(".link-dropcap");
    if (dropcapLink == null)
        return;

    unwrap(dropcapLink);

    //  If this is a graphical dropcap block...
    let dropcapImage = block.querySelector("img.dropcap");
    if (dropcapImage) {
        //  Remove mode change handler.
        GW.notificationCenter.removeHandlerForEvent(dropcapImage.modeChangeHandler, "DarkMode.computedModeDidChange");

        //  Remove graphical dropcap.
        dropcapImage.remove();
    }

    //  Text node surgery: reattach letter.
    let letterSpan = block.querySelector("span.dropcap, span.hidden-initial-letter");
    letterSpan.nextSibling.textContent = letterSpan.textContent + letterSpan.nextSibling.textContent;
    letterSpan.remove();

    //  Text node surgery: reattach preceding punctuation (if any).
    let precedingPunctuation = block.querySelector("span.initial-preceding-punctuation");
    if (precedingPunctuation) {
        precedingPunctuation.nextSibling.textContent = precedingPunctuation.textContent + precedingPunctuation.nextSibling.textContent;
        precedingPunctuation.remove();
    }
}


/**************/
/* TYPOGRAPHY */
/**************/

/****************************************************************************/
/*	Strips all special HTML structure within date range elements in the given
	block.
 */
function stripDateRangeMetadataInBlock(block) {
	block.querySelectorAll(".date-range").forEach(dateRange => {
		//	Remove subscripts.
		dateRange.querySelectorAll("sub").forEach(sub => {
			sub.remove();
		});

		//	Unwrap superscript and sub+sup span wrapper.
		unwrap(dateRange.querySelector(".subsup"));
		unwrap(dateRange.querySelector("sup"));

		//	Remove ‘title’ attribute.
		dateRange.removeAttribute("title");
	});
}


/******************************/
/* GENERAL ACTIVITY INDICATOR */
/******************************/

GW.activities = [ ];

function beginActivity() {
    GW.activities.push({ });

    if (GW.activityIndicator)
        GW.activityIndicator.classList.add("on");
}

function endActivity() {
    GW.activities.shift();

    if (   GW.activityIndicator
        && GW.activities.length == 0)
        GW.activityIndicator.classList.remove("on");
}


/********/
/* MISC */
/********/

/****************************************************************************/
/*  Returns relevant scroll container for the given element. Null is returned
    for elements whose scroll container is just the viewport.
 */
function scrollContainerOf(element) {
    if (   Extracts
        && Extracts.popFrameProvider) {
        let containingPopFrame = Extracts.popFrameProvider.containingPopFrame(element);
        if (containingPopFrame)
            return containingPopFrame.scrollView;
    }

    return null;
}

/*********************************************************/
/*  Returns page scroll position, as integer (percentage).
 */
function getPageScrollPosition() {
    return Math.round(100 * (window.pageYOffset / (document.documentElement.offsetHeight - window.innerHeight)));
}

/*********************************************************************/
/*  Returns a saved (in local storage) integer, or 0 if nothing saved.
 */
function getSavedCount(key) {
    return parseInt(localStorage.getItem(key) ?? "0");
}

/*****************************************************************************/
/*  Add 1 to a saved (in local storage) integer, or set it to 1 if none saved.
 */
function incrementSavedCount(key) {
    localStorage.setItem(key, getSavedCount(key) + 1);
}

/*****************************************************/
/*	Reset (delete) a saved (in local storage) integer.
 */
function resetSavedCount(key) {
	localStorage.removeItem(key);
}


/***********/
/* PAGE UI */
/***********/

/*************************************************************************/
/*  Adds given element (first creating it from HTML, if necessary) to
    #ui-elements-container (creating the latter if it does not exist), and
    returns the added element.

    Available option fields:

    raiseOnHover (boolean)
        When the added UI element is hovered over, it gains a `hover` class.
 */
function addUIElement(element, options) {
    options = Object.assign({
        raiseOnHover: false
    }, options);

    let uiElementsContainer = (   document.querySelector("#ui-elements-container")
                               ?? document.querySelector("body").appendChild(newElement("DIV", { id: "ui-elements-container" })));

    if (typeof element == "string")
        element = elementFromHTML(element);

    if (options.raiseOnHover == true) {
        element.addEventListener("mouseenter", (event) => {
            uiElementsContainer.classList.add("hover");
        });
        element.addEventListener("mouseleave", (event) => {
            uiElementsContainer.classList.remove("hover");
        });
    }

    return uiElementsContainer.appendChild(element);
}


/****************/
/* PAGE TOOLBAR */
/****************/

GW.pageToolbar = {
    maxDemos: 1,

    hoverUncollapseDelay: 400,
    unhoverCollapseDelay: 2500,
    demoCollapseDelay: 9000,

    /*  These values must be synced with CSS. Do not modify them in isolation!
        (Listed variables that correspond to each parameter are in default.css.
         Divide these values by 1000 and specify them in seconds, e.g. a value
         of 250 becomes a CSS value of `0.25s`.)
     */
    collapseDuration: 250, // --GW-page-toolbar-collapse-duration
    demoCollapseDuration: 1000, // --GW-page-toolbar-slow-collapse-duration
    fadeAfterCollapseDuration: 250, // --GW-page-toolbar-fade-after-collapse-duration

    //  Do not modify these two values without updating CSS also!
    widgetFlashRiseDuration: 1000, // --GW-page-toolbar-widget-flash-rise-duration
    widgetFlashFallDuration: 1000, // --GW-page-toolbar-widget-flash-fall-duration
    widgetFlashStayDuration: 500,

    toolbar: null,

    setupComplete: false,

    /*  Adds and returns page toolbar. (If page toolbar already exists, returns
        existing page toolbar.)

        NOTE: This function may run before GW.pageToolbar.setup().
     */
    getToolbar: () => {
        return (    GW.pageToolbar.toolbar
                ?? (GW.pageToolbar.toolbar = addUIElement(`<div id="page-toolbar"><div class="widgets"></div></div>`,
                                                          { raiseOnHover: true })));
    },

    /*  Adds a widget (which may contain buttons or whatever else) (first
        creating it from HTML, if necessary) to the page toolbar, and returns
        the added widget.

        NOTE: This function may run before GW.pageToolbar.setup().
     */
    addWidget: (widget) => {
        if (typeof widget == "string")
            widget = elementFromHTML(widget);

        widget.classList.add("widget");
		widget.querySelectorAll("button").forEach(button => {
			button.classList.add("widget-button");
		});

        //  Add widget.
        GW.pageToolbar.getToolbar().querySelector(".widgets").appendChild(widget);

        //  If setup has run, update state after adding widget.
        if (GW.pageToolbar.setupComplete)
            GW.pageToolbar.updateState();

        return widget;
    },

    /*  Removes a widget with the given ID and returns it.

        NOTE: This function may run before GW.pageToolbar.setup().
     */
    removeWidget: (widgetID) => {
        let widget = GW.pageToolbar.getToolbar().querySelector(`.widget#${widgetID}`);
        if (widget == null)
            return null;

        widget.remove();

        //  If setup has run, update state after removing widget.
        if (GW.pageToolbar.setupComplete)
            GW.pageToolbar.updateState();

        return widget;
    },

    /*  Returns the widget with the given ID; or null, if no such widget ID.
     */
    getWidget: (widgetID) => {
        return GW.pageToolbar.getToolbar().querySelector(`.widget#${widgetID}`);
    },

    flashWidget: (widgetID, options) => {
		options = Object.assign({
			flashStayDuration: null,
			showSelectedButtonLabel: false,
			highlightSelectedButtonLabelAfterDelay: null
		}, options);

        let widget = GW.pageToolbar.getToolbar().querySelector(`.widget#${widgetID}`);
        if (widget == null)
            return null;

        widget.classList.add("flashing");
        if (options.showSelectedButtonLabel) {
            setTimeout(() => { widget.classList.add("show-selected-button-label"); },
            		   GW.pageToolbar.widgetFlashRiseDuration * 0.5);

			if (options.highlightSelectedButtonLabelAfterDelay != null)
				setTimeout(() => { widget.classList.add("highlight-selected-button-label"); },
						   GW.pageToolbar.widgetFlashRiseDuration + options.highlightSelectedButtonLabelAfterDelay);
        }
        setTimeout(() => {
            widget.swapClasses([ "flashing", "flashing-fade" ], 1);
            setTimeout(() => {
                widget.classList.remove("flashing-fade");
            }, GW.pageToolbar.widgetFlashFallDuration);
            if (options.showSelectedButtonLabel) {
                setTimeout(() => { widget.classList.remove("show-selected-button-label"); },
                		   GW.pageToolbar.widgetFlashFallDuration * 0.5);

			if (options.highlightSelectedButtonLabelAfterDelay != null)
				setTimeout(() => { widget.classList.remove("highlight-selected-button-label"); },
						   GW.pageToolbar.widgetFlashFallDuration);
            }
        }, GW.pageToolbar.widgetFlashRiseDuration + (options.flashStayDuration ?? GW.pageToolbar.widgetFlashStayDuration));
    },

    isCollapsed: () => {
        return GW.pageToolbar.toolbar.classList.contains("collapsed");
    },

    isTempExpanded: () => {
        return GW.pageToolbar.toolbar.classList.contains("expanded-temp");
    },

    /*  Collapse or uncollapse toolbar. (The second argument uncollapses
        temporarily or collapses slowly. By default, uncollapse permanently and
        collapse quickly.)

        NOTE: Use only this method to collapse or uncollapse toolbar; the
        .collapse() and .uncollapse() methods are for internal use only.

        Available option fields:

        delay (integer)
            Collapse or uncollapse after a delay, instead of immediately.

        temp (boolean)
            If un-collapsing, do it only temporarily (re-collapse on un-hover).

        slow (boolean)
            If collapsing, do it slowly.
     */
    toggleCollapseState: (collapse, options) => {
        options = Object.assign({
            delay: 0,
            temp: false,
            slow: false
        }, options);

        if (   collapse
            && options.delay > 0) {
            GW.pageToolbar.toolbar.collapseTimer = setTimeout(GW.pageToolbar.toggleCollapseState,
                                                              options.delay,
                                                              collapse, {
                                                                  temp: options.temp,
                                                                  slow: options.slow
                                                              });
            return;
        }

		let isCollapsed = GW.pageToolbar.isCollapsed();

        GW.pageToolbar.toolbar.classList.remove("expanded-temp");

        if (collapse == undefined) {
            if (GW.pageToolbar.isCollapsed()) {
                GW.pageToolbar.uncollapse();
            } else {
                GW.pageToolbar.collapse();
            }
        } else if (collapse == true) {
            GW.pageToolbar.collapse(options.slow);
        } else {
            GW.pageToolbar.uncollapse(options.temp);
        }

		//	Fire event, if need be.
		if (isCollapsed != GW.pageToolbar.isCollapsed()) {
			GW.notificationCenter.fireEvent("GW.pageToolbarCollapseStateDidChange", {
				collapse: collapse,
				collapseOptions: options
			});
		}
    },

    /*  Collapse toolbar.

        (For internal use only; do not call except from .toggleCollapseState().)
     */
    collapse: (slow = false) => {
        clearTimeout(GW.pageToolbar.toolbar.collapseTimer);

        GW.pageToolbar.toolbar.classList.add("collapsed");

        if (slow) {
            GW.pageToolbar.addToolbarClassesTemporarily("animating", "collapsed-slowly",
                GW.pageToolbar.demoCollapseDuration + GW.pageToolbar.fadeAfterCollapseDuration);
        } else {
            GW.pageToolbar.addToolbarClassesTemporarily("animating",
                GW.pageToolbar.collapseDuration + GW.pageToolbar.fadeAfterCollapseDuration);
        }
    },

    /*  Uncollapse toolbar.

        (For internal use only; do not call except from .toggleCollapseState().)
     */
    uncollapse: (temp = false) => {
        clearTimeout(GW.pageToolbar.toolbar.collapseTimer);

        GW.pageToolbar.addToolbarClassesTemporarily("animating",
            GW.pageToolbar.collapseDuration + GW.pageToolbar.fadeAfterCollapseDuration);

        GW.pageToolbar.toolbar.classList.remove("collapsed", "collapsed-slowly");

        if (temp)
            GW.pageToolbar.toolbar.classList.add("expanded-temp");
    },

    /*  Fade toolbar to full transparency.
     */
    fade: () => {
        GW.pageToolbar.toolbar.classList.add("faded");
    },

    /*  Un-fade toolbar from full transparency.
     */
    unfade: () => {
        GW.pageToolbar.toolbar.classList.remove("faded");
    },

    /*  Temporarily add one or more classes to the toolbar. Takes 2 or more
        arguments; the 1st through n-1’th argument are strings (class names),
        while the last argument is a number (the time duration after which
        the added classes shall be removed).
     */
    addToolbarClassesTemporarily: (...args) => {
        clearTimeout(GW.pageToolbar.toolbar.tempClassTimer);

        let duration = args.last;

        GW.pageToolbar.toolbar.classList.add(...(args.slice(0, -1)));
        GW.pageToolbar.toolbar.tempClassTimer = setTimeout(() => {
            GW.pageToolbar.toolbar.classList.remove(...(args.slice(0, -1)));
        }, duration);
    },

    /*  Update layout, position, and collapse state of toolbar.
        (Called when window is scrolled or resized, and also when widgets are
         added or removed.)
     */
    updateState: (event) => {
        if (   event
            && event.type == "scroll"
            && (   GW.isMobile()
            	|| GW.pageToolbar.toolbar.matches(":hover") == false)) {
            //  Collapse on scroll.
            let thresholdScrollDistance = (0.2 * window.innerHeight);
            if (   GW.scrollState.unbrokenUpScrollDistance   > (0.2 * window.innerHeight)
                || GW.scrollState.unbrokenDownScrollDistance > (0.2 * window.innerHeight))
                GW.pageToolbar.toggleCollapseState(true);

            //  Fade on scroll; unfade when scrolling to top.
            let pageScrollPosition = getPageScrollPosition();
            if (   pageScrollPosition == 0
                || pageScrollPosition == 100
                || GW.scrollState.unbrokenUpScrollDistance       > (0.8 * window.innerHeight)) {
                GW.pageToolbar.unfade();
            } else if (GW.scrollState.unbrokenDownScrollDistance > (0.8 * window.innerHeight)) {
                GW.pageToolbar.fade();
            }
        } else {
            if (GW.isMobile()) {
                GW.pageToolbar.toolbar.classList.add("mobile", "button-labels-not");
            } else {
                GW.pageToolbar.toolbar.classList.add("desktop");
                GW.pageToolbar.toolbar.classList.remove("vertical", "horizontal", "button-labels-not");

                GW.pageToolbar.toolbar.classList.add("vertical");
            }
        }
    },

	setPositionOffset: (offset) => {
		if (GW.pageToolbar.toolbar == null)
			return;

		GW.pageToolbar.toolbar.style.setProperty("--toolbar-offset-x", offset.x + "px");
		GW.pageToolbar.toolbar.style.setProperty("--toolbar-offset-y", offset.y + "px");
	},

	shouldStartCollapsed: () => {
		return (   GW.isTorBrowser()
        		|| getSavedCount("page-toolbar-demos-count") >= GW.pageToolbar.maxDemos);
	},

    setup: () => {
        GW.pageToolbar.toolbar = GW.pageToolbar.getToolbar();

        let startCollapsed = GW.pageToolbar.shouldStartCollapsed();
        if (startCollapsed) {
            //  Don’t collapse if hovering.
            if (GW.pageToolbar.toolbar.matches(":hover") == false)
                GW.pageToolbar.toggleCollapseState(true);
        }

        GW.pageToolbar.toolbar.append(
            newElement("BUTTON", {
                type: "button",
                title: "Collapse/expand controls",
                class: "toggle-button main-toggle-button",
                tabindex: "-1",
                accessKey: "t"
            }, {
                innerHTML: GW.svg("gear-solid")
            }),
            newElement("BUTTON", {
                type: "button",
                title: "Collapse controls",
                class: "toggle-button collapse-button",
                tabindex: "-1"
            }, {
                innerHTML: GW.svg("chevron-down-regular")
            })
        );

		//	Toolbar toggle button click event handler.
		let buttonClickHandler = (event) => {
			//  Left-click only.
			if (event.button != 0)
				return;

			if (GW.pageToolbar.isTempExpanded()) {
				/*  Do not re-collapse if temp-expanded; instead,
					permanentize expanded state (expand-lock).
				 */
				GW.pageToolbar.toggleCollapseState(false);
			} else {
				//  Expand or collapse.
				GW.pageToolbar.toggleCollapseState();
			}
		};

		/*	Inject inline mode widgets in already-loaded content, and add
			rewrite processor to inject any inline widgets in subsequently
			loaded content.
		 */
		processMainContentAndAddRewriteProcessor("addInlineToolbarToggleWidgetsInContainer", (container) => {
			container.querySelectorAll(".toolbar-mode-selector-inline").forEach(element => {
				let widgetHTML = `<span class="toolbar-toggle-widget mode-selector mode-selector-inline`
							   + (startCollapsed ? " toolbar-collapsed" : "")
							   + `">`
							   + `<button
							   	   type="button"
							   	   class="toggle-button"
							   	   title="Collapse/expand controls"
							   	   tabindex="-1">`
							   + `<span class="icon">`
							   + GW.svg("gear-solid")
							   + `</span>`
							   + `</button>`
							   + `</span>`;
				let widget = elementFromHTML(widgetHTML);
				element.replaceWith(widget);
				widget.querySelector("button").addEventListener("click", buttonClickHandler);
				wrapParenthesizedNodes("inline-mode-selector", widget);

				GW.notificationCenter.addHandlerForEvent("GW.pageToolbarCollapseStateDidChange", (eventInfo) => {
					widget.classList.toggle("toolbar-collapsed", eventInfo.collapse);
				});
			});
		});

        //  Activate buttons.
        GW.pageToolbar.toolbar.querySelectorAll("button.toggle-button").forEach(button => {
            //  Toggle collapse state on click/tap.
            button.addEventListener("click", buttonClickHandler);

            if (button.classList.contains("main-toggle-button")) {
                if (GW.isMobile()) {
                    //  Unfade on tap.
                    button.addEventListener("mousedown", (event) => {
                        GW.pageToolbar.unfade();
                    });
                } else {
                    //  Unfade on hover.
                    GW.pageToolbar.toolbar.addEventListener("mouseenter", (event) => {
                        GW.pageToolbar.unfade();
                    });

                    //  Uncollapse on hover.
                    onEventAfterDelayDo(button, "mouseenter", GW.pageToolbar.hoverUncollapseDelay, (event) => {
                        if (GW.pageToolbar.isCollapsed())
                            GW.pageToolbar.toggleCollapseState(false, { temp: true });
                    }, {
                        cancelOnEvents: [ "mouseleave", "mousedown" ]
                    });

                    //  Collapse on unhover.
                    onEventAfterDelayDo(GW.pageToolbar.toolbar, "mouseleave", GW.pageToolbar.unhoverCollapseDelay, (event) => {
                        if (GW.pageToolbar.isTempExpanded())
                            GW.pageToolbar.toggleCollapseState(true);
                    }, {
                        cancelOnEvents: [ "mouseenter" ]
                    });
                }
            }
        });

        //  Set initial state.
        GW.pageToolbar.updateState();

        doWhenPageLoaded(() => {
            /*  Slowly collapse toolbar shortly after page load (if it’s not
                already collapsed).
             */
            let startCollapsed = GW.pageToolbar.shouldStartCollapsed();
            if (startCollapsed == false) {
                requestAnimationFrame(() => {
                    Array.from(GW.pageToolbar.getToolbar().querySelector(".widgets").children).forEach(widget => {
                        let order = parseInt(getComputedStyle(widget).order);
                        setTimeout(GW.pageToolbar.flashWidget,
                                   order * GW.pageToolbar.widgetFlashRiseDuration * 4/3,
                                   widget.id, {
                                       showSelectedButtonLabel: true
                                   });
                    });

                    //  Don’t collapse if hovering.
                    if (GW.pageToolbar.toolbar.matches(":hover") == false)
                        GW.pageToolbar.toggleCollapseState(true, {
                                                              slow: true,
                                                              delay: GW.pageToolbar.demoCollapseDelay
                                                           });
                });

                incrementSavedCount("page-toolbar-demos-count");
            }

            //  Update toolbar state on scroll.
            addScrollListener(GW.pageToolbar.updateState, {
                name: "updatePageToolbarStateOnScrollListener",
                defer: true
            });

            //  Update toolbar state on window resize.
            addWindowResizeListener(GW.pageToolbar.updateState, {
                name: "updatePageToolbarStateOnWindowResizeListener",
                defer: true
            });
        });

        GW.pageToolbar.setupComplete = true;
    },

	expandToolbarFlashWidgetDoThing: (widgetId, doThing, options) => {
		options = Object.assign({
			widgetFlashStayDuration: 3000,
			doThingDelay: 250
		}, options);

		//	Expand toolbar.
		GW.pageToolbar.toggleCollapseState(false);

		setTimeout(() => {
			GW.pageToolbar.flashWidget(widgetId, {
				flashStayDuration: options.widgetFlashStayDuration,
				showSelectedButtonLabel: true,
				highlightSelectedButtonLabelAfterDelay: options.doThingDelay
			});
			setTimeout(() => {
				doThing();

				//	Collapse toolbar, after a delay.
				GW.pageToolbar.toggleCollapseState(true, {
													   delay: GW.pageToolbar.demoCollapseDelay
															+ options.widgetFlashStayDuration
															+ GW.pageToolbar.widgetFlashFallDuration
												   });
			}, GW.pageToolbar.widgetFlashRiseDuration + options.doThingDelay);
		}, GW.pageToolbar.collapseDuration);
	}
};

doWhenBodyExists(GW.pageToolbar.setup);


/********************/
/* BACK TO TOP LINK */
/********************/

/*********************************************************************/
/*  Show/hide the back-to-top link in response to scrolling.

    Called by the ‘updateBackToTopLinkScrollListener’ scroll listener.
 */
function updateBackToTopLinkVisibility(event) {
    GWLog("updateBackToTopLinkVisibility", "misc.js", 3);

    //  One PgDn’s worth of scroll distance, approximately.
    let onePageScrollDistance = (0.8 * window.innerHeight);

    let pageScrollPosition = getPageScrollPosition();

    //  Hide back-to-top link when scrolling to top.
    if (pageScrollPosition == 0)
        GW.backToTop.classList.toggle("hidden", true);
    //  Show back-to-top link when scrolling to bottom.
    else if (pageScrollPosition == 100)
        GW.backToTop.classList.toggle("hidden", false);
    //  Show back-to-top link when scrolling a full page down from the top.
    else if (GW.scrollState.unbrokenDownScrollDistance > onePageScrollDistance * 2.0)
        GW.backToTop.classList.toggle("hidden", false);
    //  Hide back-to-top link on half a page’s worth of scroll up.
    else if (GW.scrollState.unbrokenUpScrollDistance > onePageScrollDistance * 0.5)
        GW.backToTop.classList.toggle("hidden", true);
}

/**********************************/
/*  Injects the “back to top” link.
 */
if (GW.isMobile() == false) doWhenPageLoaded(() => {
    GWLog("injectBackToTopLink", "misc.js", 1);

    GW.backToTop = addUIElement(`<div id="back-to-top"><a href="#top" tabindex="-1" title="Back to top">`
        + GW.svg("arrow-up-to-line-light")
        + `</a></div>`);

    //  Show/hide the back-to-top link on scroll up/down.
    addScrollListener(updateBackToTopLinkVisibility, {
        name: "updateBackToTopLinkScrollListener",
        defer: true,
        ifDeferCallWhenAdd: true
    });

    //  Show the back-to-top link on mouseover.
    GW.backToTop.addEventListener("mouseenter", (event) => {
        GW.backToTop.style.transition = "none";
        GW.backToTop.classList.toggle("hidden", false);
    });
    GW.backToTop.addEventListener("mouseleave", (event) => {
        GW.backToTop.style.transition = "";
    });
    GW.backToTop.addEventListener("click", (event) => {
        GW.backToTop.style.transition = "";
    });
});

/***********************************************************/
/*	Rewrite footer logo link to also link to #top on /index.
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteIndexFooterLogoLinkHref = (eventInfo) => {
    GWLog("rewriteIndexFooterLogoLinkHref", "misc.js", 1);

    eventInfo.container.querySelectorAll("#footer-decoration-container .footer-logo").forEach(footerLogo => {
        footerLogo.href = "#top";
    });
}, "rewrite", (info) => (   info.container == document.main
                         && /\/(index)?$/.test(location.pathname)));


/*******************/
/* FLOATING HEADER */
/*******************/

GW.floatingHeader = {
    minimumYOffset: 0,

    maxChainLength: 6,

	//	Mobile only.
    maxHeaderHeight: 60,

    chainLinkClasses: {
        "…": "ellipsis",
        "header": "page-title"
    },

    currentTrail: [ ],

	isHidden: () => {
		return GW.floatingHeader.header?.classList.contains("hidden");
	},

    /*  Show/hide the floating header, and update state, in response to
        scroll event.

        (Called by the ‘updateFloatingHeaderScrollListener’ scroll listener.)
     */
    updateState: (event, maxChainLength = GW.floatingHeader.maxChainLength) => {
        GWLog("updateFloatingHeaderState", "misc.js", 3);

        //  Show/hide the entire header.
        GW.floatingHeader.header.classList.toggle("hidden",
            window.pageYOffset < GW.floatingHeader.minimumYOffset);

        //  Update scroll indicator bar.
        GW.floatingHeader.scrollIndicator.dataset.scrollPosition = getPageScrollPosition();
        GW.floatingHeader.scrollIndicator.style.backgroundSize = `${GW.floatingHeader.scrollIndicator.dataset.scrollPosition}% 100%`;

        //  Update breadcrumb display.
        let trail = GW.floatingHeader.getTrail();
		if (GW.isMobile()) {
			/*	We must update the display if either the current position in the
				page has changed (i.e., we’ve scrolled), or if we are having to
				re-compute the state due to having to reduce the header height
				from what it would be if we were displaying the entire current
				trail (i.e. if this is a recursive call).
			 */
			if (   trail.join("/") != GW.floatingHeader.currentTrail.join("/")
				|| maxChainLength < GW.floatingHeader.maxChainLength) {
				GW.floatingHeader.linkChain.classList.toggle("truncate-page-title", trail.length > maxChainLength);

				let chainLinks = GW.floatingHeader.constructLinkChain(trail, maxChainLength);
				GW.floatingHeader.linkChain.replaceChildren(...chainLinks);
				chainLinks.forEach(link => {
					let span = wrapElement(link, "span.link", { moveClasses: true });

					//	Enable special link click behavior.
					link.addActivateEvent(GW.floatingHeader.linkInChainClicked);
				});

				//  Constrain header height.
				if (   GW.floatingHeader.header.offsetHeight > GW.floatingHeader.maxHeaderHeight
					&& maxChainLength > 1) {
					GW.floatingHeader.updateState(event, maxChainLength - 1);
					return;
				}

				//	Update current trail.
				GW.floatingHeader.currentTrail = trail;
			}

			/*	Update page toolbar position offset, so that the header does not
				block the page toolbar toggle button.
			 */
			GW.pageToolbar.setPositionOffset(new DOMPoint(0, GW.floatingHeader.isHidden() == false
															 ? -1 * GW.floatingHeader.header.offsetHeight
															 : 0));
		} else {
        	/*	We must update the display if the current position in the page
        		has changed (i.e., we’ve scrolled).
        	 */
			if (trail.join("/") != GW.floatingHeader.currentTrail.join("/")) {
				let chainLinks = GW.floatingHeader.constructLinkChain(trail, maxChainLength);
				GW.floatingHeader.linkChain.replaceChildren(...chainLinks);
				let index = 0;
				chainLinks.forEach(link => {
					let span = wrapElement(link, "span.link", { moveClasses: true });

					//	Enable layout based on nesting level.
					span.style.setProperty("--link-index", index++);
				});

				//	Chain links should spawn section popups.
				Extracts.addTargetsWithin(GW.floatingHeader.linkChain);

				//	Update current trail.
				GW.floatingHeader.currentTrail = trail;
			}
		}
    },

    getTrail: () => {
        let element = document.elementFromPoint(window.innerWidth / 2, 20);

        if (   element.tagName == "SECTION"
            || element == GW.floatingHeader.markdownBody)
            return (GW.floatingHeader.currentTrail.length == 0
                    ? [ "header" ]
                    : GW.floatingHeader.currentTrail);

        if (GW.floatingHeader.firstSection == null)
            return [ "header" ];

        if (GW.floatingHeader.firstSection.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)
            return [ "header" ];

        if (   GW.floatingHeader.markdownBody.contains(element) == false
            && GW.floatingHeader.pageMainElement.contains(element) == true)
            return GW.floatingHeader.currentTrail;

        let trail = [ ];
        while (element = element.closest("section")) {
            trail.push(`#${element.id}`);
            element = element.parentElement;
        }

        if (trail.length == 0)
            return GW.floatingHeader.currentTrail;

        trail.push("header");
        trail.reverse();

        return trail;
    },

    constructLinkChain: (trail, maxChainLength) => {
        let deleteCount = Math.max(0, trail.length - maxChainLength);
        if (deleteCount > 0) {
            trail = trail.slice();
            trail.splice(0, deleteCount - 1, "…");
        }

        let chain = trail.map(x => newElement("A", {
            href: (x.startsWith("#") ? x : "#top"),
            class: (GW.floatingHeader.chainLinkClasses[x] ?? "")
        }, {
            innerHTML: (x.startsWith("#")
                        ? (x == "#footnotes"
                           ? "Footnotes"
                           : document.querySelector(`#${(CSS.escape(x.slice(1)))} .heading a`).innerHTML)
                        : (x == "…"
                           ? "…"
                           : GW.floatingHeader.pageHeader.textContent)).trim()
        }));

        if (chain[0].innerHTML == "…") {
            chain[0].href = chain[1].href;
            chain.splice(1, 1);
        }

        return chain;
    },

    linkInChainClicked: (event) => {
        if (Extracts.popFrameProvider == Popins)
            Popins.removeAllPopins();
    },

    setup: () => {
        GWLog("GW.floatingHeader.setup", "misc.js", 1);

        //  No floating header on desktop /index.
        if (   GW.isMobile() == false
            && /\/(index)?$/.test(location.pathname))
            return;

        //  Inject header.
        if (GW.isMobile()) {
			GW.floatingHeader.header = addUIElement(  `<div id="floating-header" class="hidden position-bottom">`
													+ `<div class="scroll-indicator"></div>`
													+ `<div class="link-chain"></div>`
													+ `</div>`);

        } else {
			GW.floatingHeader.header = addUIElement(  `<div id="floating-header" class="hidden position-top">`
													+ `<div class="link-chain"></div>`
													+ `<div class="scroll-indicator"></div>`
													+ `</div>`);
        }

        //  Designate desktop version of header.
        if (GW.isMobile() == false)
            GW.floatingHeader.header.classList.add("desktop");

        //  Pre-query elements, so as not to waste cycles on each scroll event.
        GW.floatingHeader.linkChain = GW.floatingHeader.header.querySelector(".link-chain");
        GW.floatingHeader.scrollIndicator = GW.floatingHeader.header.querySelector(".scroll-indicator");
        GW.floatingHeader.pageHeader = document.querySelector("header");
        GW.floatingHeader.pageMainElement = document.querySelector("main");
        GW.floatingHeader.markdownBody = document.querySelector("#markdownBody");
        GW.floatingHeader.firstSection = document.querySelector("section");

        //  Calculate minimum Y offset.
        let thresholdElement = getComputedStyle(GW.floatingHeader.pageHeader).display != "none"
                               ? GW.floatingHeader.pageHeader
                               : document.querySelector("#sidebar");
        GW.floatingHeader.minimumYOffset = thresholdElement.getBoundingClientRect().top
                                         + window.pageYOffset
                                         + thresholdElement.offsetHeight;

        //  Show/hide the back-to-top link on scroll up/down.
        addScrollListener(GW.floatingHeader.updateState, {
            name: "updateFloatingHeaderScrollListener",
            defer: true,
            ifDeferCallWhenAdd: true
        });

		//	Ensure that popin positioning takes header height into account.
		if (GW.isMobile()) {
			if (window["Popins"] == null) {
				GW.notificationCenter.addHandlerForEvent("Popins.didLoad", (info) => {
					Popins.windowBottomPopinPositionMargin = GW.floatingHeader.maxHeaderHeight;
				}, { once: true });
			} else {
				Popins.windowBottomPopinPositionMargin = GW.floatingHeader.maxHeaderHeight;
			}
		}
    }
};

doWhenPageLoaded(GW.floatingHeader.setup);


/***************************/
/* POP-FRAME SPAWN WIDGETS */
/***************************/

GW.popFrameSpawnWidgets = {
	widgetTypes: {
		template: {
			//	Configuration.
			linkHref: null,
			linkAdditionalAttributes: null,
			iconName: null,
			onPopupPinDo: null,
			addToolbarWidget: false,
			toolbarWidgetLabel: null,
			inlineWidgetReplacedElementSelector: null,
			keyCommand: null,
			additionalSetup: null,
			additionalWidgetActivation: null,

			//	Defaults.
			keyCommandSpawnWidgetFlashStayDuration: 3000,

			//	Infrastructure.
			toolbarWidget: null,
			virtualWidget: null
		}
	},

	addWidgetType: (widgetTypeName, widgetTypeSpec) => {
		return (GW.popFrameSpawnWidgets.widgetTypes[widgetTypeName] = Object.assign({ },
			GW.popFrameSpawnWidgets.widgetTypes.template,
			widgetTypeSpec,
			{ name: widgetTypeName }));
	},

	pinPopup: (popup) => {
		if (popup == null)
			return;

		let widgetType = GW.popFrameSpawnWidgets.widgetTypes[popup.spawningTarget.closest(".link-widget").dataset.widgetType];

		Popups.pinPopup(popup);
		Popups.bringPopupToFront(popup);

		if (widgetType.onPopupPinDo != null)
			requestAnimationFrame(() => { widgetType.onPopupPinDo(popup); });
	},

	activateWidget: (widget) => {
		let widgetType = GW.popFrameSpawnWidgets.widgetTypes[widget.dataset.widgetType];

		widget.widgetLink.onclick = () => false;

        //  Activate pop-frames.
        Extracts.addTargetsWithin(widget);

        //  Configure pop-frame behavior.
        if (Extracts.popFrameProvider == Popups) {
            //  Configure popup positioning and click response.
            widget.widgetLink.cancelPopupOnClick = () => false;
			widget.widgetLink.keepPopupAttachedOnPin = () => true;
            if (   widget == widgetType.toolbarWidget
            	|| widget == widgetType.virtualWidget)
	            widget.widgetLink.preferPopupSidePositioning = () => true;

            //  Pin popup if widget is clicked.
            widget.widgetLink.addActivateEvent((event) => {
				if (widget.widgetLink.popup == null) {
					//  When the popup spawns, pin it.
					GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", (info) => {
						requestAnimationFrame(() => {
							GW.popFrameSpawnWidgets.pinPopup(info.popup);
						});
					}, {
						once: true,
						condition: (info) => (info.popup.spawningTarget == widget.widgetLink)
					});

					//  Spawn popup.
					Popups.spawnPopup(widget.widgetLink);
				} else {
					GW.popFrameSpawnWidgets.pinPopup(widget.widgetLink.popup);
				}
            });
        }

		//	Run any additional activation code.
		if (widgetType.additionalWidgetActivation != null)
			widgetType.additionalWidgetActivation(widget);
	},

	setup: (widgetType) => {
		if (widgetType.addToolbarWidget == true) {
			//	Add.
			let widgetHTML = `<div
							   id="${widgetType.name}-widget"
							   class="link-widget"
							   data-widget-type="${widgetType.name}">`
						   + `<a
						   	   class="${widgetType.name} widget-button no-footer-bar"
						   	   href="${widgetType.linkHref}" `
						   + (Object.entries(widgetType.linkAdditionalAttributes ?? { }).map(
						   		([ attrName, attrValue ]) => `${attrName}="${attrValue}"`
						   	  ).join(" "))
						   + `>`
						   + `<span class="icon">`
						   + GW.svg(widgetType.iconName)
						   + `</span>`
						   + `<span class="label">${widgetType.toolbarWidgetLabel}</span>`
						   + `</a></div>`;
			widgetType.toolbarWidget = GW.pageToolbar.addWidget(widgetHTML);
			widgetType.toolbarWidget.widgetLink = widgetType.toolbarWidget.querySelector("a");

			//	Activate.
			GW.popFrameSpawnWidgets.activateWidget(widgetType.toolbarWidget);
		} else if (widgetType.keyCommand != null) {
			//	Create “virtual widget”.
			let widgetHTML = `<div
							   id="${widgetType.name}-widget"
							   class="link-widget"
							   data-widget-type="${widgetType.name}">`
						   + `<a class="${widgetType.name} no-footer-bar"
								 href="${widgetType.linkHref}" `
						   + (Object.entries(widgetType.linkAdditionalAttributes ?? { }).map(
						   		([ attrName, attrValue ]) => `${attrName}="${attrValue}"`
						   	  ).join(" "))
						   + `></a></div>`;
			widgetType.virtualWidget = GW.popFrameSpawnWidgets.virtualWidgetContainer.appendChild(elementFromHTML(widgetHTML));
			widgetType.virtualWidget.widgetLink = widgetType.virtualWidget.querySelector("a");

			//	Activate.
			GW.popFrameSpawnWidgets.activateWidget(widgetType.virtualWidget);
		}

		if (widgetType.inlineWidgetReplacedElementSelector != null) {
			/*	Inject inline mode widgets in already-loaded content, and add
				rewrite processor to inject any inline widgets in subsequently
				loaded content.
			 */
			processMainContentAndAddRewriteProcessor("addInline_" + widgetType.name + "_widgetsInContainer", (container) => {
				container.querySelectorAll(widgetType.inlineWidgetReplacedElementSelector).forEach(element => {
					let widgetHTML = `<span class="link-widget" data-widget-type="${widgetType.name}">`
								   + `<a class="${widgetType.name} no-footer-bar"
								   		 href="${widgetType.linkHref}" `
								   + (Object.entries(widgetType.linkAdditionalAttributes ?? { }).map(
								   		([ attrName, attrValue ]) => `${attrName}="${attrValue}"`
								   	  ).join(" "))
								   + `>`
								   + `<span class="icon-${widgetType.iconName}"></span>`
								   + `</a>`;
					let widget = elementFromHTML(widgetHTML);
					widget.widgetLink = widget.querySelector("a");
					element.replaceWith(widget);
					wrapParenthesizedNodes("inline-mode-selector", widget);

					//	Activate.
					GW.popFrameSpawnWidgets.activateWidget(widget);
				});
			});
		}

		if (widgetType.additionalSetup != null)
			widgetType.additionalSetup(widgetType);
	},
};

doWhenPageLoaded(() => {
	//	Add virtual widget container.
	GW.popFrameSpawnWidgets.virtualWidgetContainer = document.body.appendChild(newElement("DIV", { id: "virtual-widget-container" }));

	//	Add event handler for widget key commands.
	GW.notificationCenter.addHandlerForEvent("GW.keyWasPressed", GW.popFrameSpawnWidgets.keyPressEventHandler = (eventInfo) => {
		eventInfo.keyUpEvent.preventDefault();

		let widgetType = Object.values(GW.popFrameSpawnWidgets.widgetTypes).find(widgetType => widgetType.keyCommand == eventInfo.key);

		if (widgetType.toolbarWidget != null) {
			//  Expand page toolbar.
			GW.pageToolbar.toggleCollapseState(false, {
				temp: (GW.pageToolbar.isCollapsed() || GW.pageToolbar.isTempExpanded())
			});

			//	Flash widget.
			GW.pageToolbar.flashWidget(widgetType.toolbarWidget.id, {
				flashStayDuration: widgetType.keyCommandSpawnWidgetFlashStayDuration
			});
		}

		let mainWidgetLink = (widgetType.toolbarWidget ?? widgetType.virtualWidget).widgetLink;
		if (mainWidgetLink.popup == null) {
			//  When the popup spawns, pin it.
			GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", (info) => {
				requestAnimationFrame(() => {
					GW.popFrameSpawnWidgets.pinPopup(mainWidgetLink.popup);
				});
			}, {
				once: true,
				condition: (info) => (info.popup.spawningTarget == mainWidgetLink)
			});

			//  Spawn popup.
			Popups.spawnPopup(mainWidgetLink);
		} else {
			GW.popFrameSpawnWidgets.pinPopup(mainWidgetLink.popup);
		}
	}, {
		condition: (info) => (Object.values(GW.popFrameSpawnWidgets.widgetTypes).map(
			widgetType => widgetType.keyCommand
		).filter(x => x).includes(info.key))
	});

	//	Set up help widget(s).
	GW.popFrameSpawnWidgets.setup(GW.popFrameSpawnWidgets.addWidgetType("help", {
		linkHref: "/help",
		linkAdditionalAttributes: null,
		iconName: "question-solid",
		onPopupPinDo: null,
		addToolbarWidget: true,
		toolbarWidgetLabel: "Help",
		inlineWidgetReplacedElementSelector: ".help-mode-selector-inline",
		keyCommand: "?"
	}));

	//	Set up search widget(s).
	GW.popFrameSpawnWidgets.setup(GW.popFrameSpawnWidgets.addWidgetType("search", {
		linkHref: "/static/google-search.html",
		linkAdditionalAttributes: { "aria-label": "Search site with Google Search",
									"data-link-content-type": "local-document" },
		iconName: "magnifying-glass",
		onPopupPinDo: (popup) => { popup.document.querySelector("iframe")?.contentDocument?.querySelector("input")?.focus(); },
		addToolbarWidget: true,
		toolbarWidgetLabel: "Search",
		inlineWidgetReplacedElementSelector: ".search-mode-selector-inline",
		keyCommand: "/",
		additionalSetup: (widgetType) => {
			//	Add DNS-prefetch tag.
			//	See https://developer.mozilla.org/en-US/docs/Web/Performance/dns-prefetch
			document.head.appendChild(elementFromHTML(`<link rel="dns-prefetch" href="https://www.google.com/search" />`));
		},
		additionalWidgetActivation: (widget) => {
			//	Function to set the proper mode (auto, light, dark) in the iframe.
			let updateSearchIframeMode = (iframe) => {
				iframe.contentDocument.querySelector("#search-styles-dark").media = DarkMode.mediaAttributeValues[DarkMode.currentMode()];
			};

			//  Event handler for popup spawn / popin inject.
			let popFrameSpawnEventHandler = (eventInfo) => {
				let popFrame = (eventInfo.popup ?? eventInfo.popin);
				let iframe = popFrame.document.querySelector("iframe");
				iframe.addEventListener("load", (event) => {
					//	Set proper mode.
					updateSearchIframeMode(iframe);

					//	Add handler to update search pop-frame when switching modes.
					GW.notificationCenter.addHandlerForEvent("DarkMode.didSetMode", iframe.darkModeDidSetModeHandler = (info) => {
						updateSearchIframeMode(iframe)
					});

					let inputBox = iframe.contentDocument.querySelector("input.search");

					//  Focus search box on load.
					inputBox.focus();
					inputBox.addEventListener("blur", (event) => {
						inputBox.focus();
					});

					if (Extracts.popFrameProvider == Popups) {
						//	Pin popup if text is entered.
						inputBox.addEventListener("input", (event) => {
							Popups.pinPopup(popFrame);
						});

						//	Enable normal popup Esc-key behavior.
						iframe.contentDocument.addEventListener("keyup", (event) => {
							let allowedKeys = [ "Escape", "Esc" ];
							if (allowedKeys.includes(event.key) == false)
								return;

							event.preventDefault();

							if (Popups.popupIsPinned(popFrame)) {
								Popups.unpinPopup(popFrame);
							} else {
								Popups.despawnPopup(popFrame);
							}
						});
					}

					//	Enable “search where” functionality.
					let searchWhereSelector = iframe.contentDocument.querySelector("#search-where-selector");
					searchWhereSelector.querySelectorAll("input").forEach(radioButton => {
						radioButton.addEventListener("change", (event) => {
							searchWhereSelector.querySelectorAll("input").forEach(otherRadioButton => {
								otherRadioButton.removeAttribute("checked");
							});
							radioButton.setAttribute("checked", "");
						});
					});

					//	Enable submit override (to make site search work).
					iframe.contentDocument.querySelector(".searchform").addEventListener("submit", (event) => {
						event.preventDefault();

						let form = event.target;
						form.querySelector("input.query").value = searchWhereSelector.querySelector("input[checked]").value
																+ " "
																+ form.querySelector("input.search").value;
						form.submit();
					});
				});
			};

			//	Event handler for popup despawn.
			let popFrameDespawnEventHandler = (eventInfo) => {
				let popFrame = (eventInfo.popup ?? eventInfo.popin);
				GW.notificationCenter.removeHandlerForEvent("DarkMode.didSetMode", popFrame.document.querySelector("iframe").darkModeDidSetModeHandler);
			};

			//  Add pop-frame spawn/despawn event handlers.
			if (Extracts.popFrameProvider == Popups) {
				GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", popFrameSpawnEventHandler, {
					condition: (info) => (info.popup.spawningTarget == widget.widgetLink)
				});
				GW.notificationCenter.addHandlerForEvent("Popups.popupWillDespawn", popFrameDespawnEventHandler, {
					condition: (info) => (info.popup.spawningTarget == widget.widgetLink)
				});
			} else {
				GW.notificationCenter.addHandlerForEvent("Popins.popinDidInject", popFrameSpawnEventHandler, {
					condition: (info) => (info.popin.spawningTarget == widget.widgetLink)
				});
				GW.notificationCenter.addHandlerForEvent("Popins.popinWillDespawn", popFrameDespawnEventHandler, {
					condition: (info) => (info.popin.spawningTarget == widget.widgetLink)
				});
			}
		}
	}));
});


/****************/
/* KEY COMMANDS */
/****************/
/*  Proper keypress support (such that keypress sequences work properly for
	modified keypresses).
 */

GW.keyCommands = {
	keysPressed: { },

	keyDown: (event) => {
		GWLog("GW.keyCommands.keyDown", "misc.js", 3);

		GW.keyCommands.keysPressed[event.keyCode] = {
			key: event.key,
			altKey: event.altKey,
			ctrlKey: event.altKey,
			metaKey: event.altKey,
			shiftKey: event.altKey,
		};
	},

	keyUp: (event) => {
	    GWLog("GW.keyCommands.keyUp", "misc.js", 3);

		let keyDownEventInfo = GW.keyCommands.keysPressed[event.keyCode];
		if (keyDownEventInfo == null)
			return;

		GW.notificationCenter.fireEvent("GW.keyWasPressed", {
			key: keyDownEventInfo.key,
			altKey: keyDownEventInfo.altKey,
			ctrlKey: keyDownEventInfo.altKey,
			metaKey: keyDownEventInfo.altKey,
			shiftKey: keyDownEventInfo.altKey,
			keyUpEvent: event
		});

		GW.keyCommands.keysPressed[event.keyCode] = null;
	}
};

doWhenPageLoaded(() => {
	document.addEventListener("keydown", GW.keyCommands.keyDown);
	document.addEventListener("keyup", GW.keyCommands.keyUp);
});


/******************************/
/* GENERAL ACTIVITY INDICATOR */
/******************************/

doWhenBodyExists(() => {
    GW.activityIndicator = addUIElement(`<div id="general-activity-indicator" class="on">`
        + GW.svg("spinner-regular")
        + `</div>`);
});

doWhenPageLayoutComplete(() => {
    endActivity();
});


/**************************/
/* LOCATION HASH HANDLING */
/**************************/

function cleanLocationHash() {
    GWLog("cleanLocationHash", "misc.js", 2);

    if (   location.hash == "#top"
        || (   location.hash == ""
            && location.href.endsWith("#"))) {
        relocate(location.pathname);
    }
}

doWhenPageLayoutComplete(GW.pageLayoutCompleteHashHandlingSetup = (info) => {
    GWLog("GW.pageLayoutCompleteHashHandlingSetup", "misc.js", 1);

    //  Chrome’s fancy new “scroll to text fragment”. Deal with it in Firefox.
    if (GW.isFirefox()) {
        if (location.hash.startsWith("#:~:")) {
            relocate(location.pathname);
        } else if (location.hash.includes(":~:")) {
            relocate(location.hash.replace(/:~:.*$/, ""));
        }
    }

    //  Clean location hash.
    cleanLocationHash();

    //  Save hash, for change tracking.
    GW.locationHash = location.hash;

    /*  Remove “#top” or “#” from the URL hash (e.g. after user clicks on the
        back-to-top link).
     */
    window.addEventListener("hashchange", GW.handleBrowserHashChangeEvent = () => {
        GWLog("GW.handleBrowserHashChangeEvent", "misc.js", 1);

        //  Clean location hash.
        cleanLocationHash();

        //  If hash really changed, update saved hash and fire event.
        if (GW.locationHash != location.hash) {
            GW.notificationCenter.fireEvent("GW.hashDidChange", { oldHash: GW.locationHash });
            GW.locationHash = location.hash;
        }
    });

    GW.notificationCenter.fireEvent("GW.hashHandlingSetupDidComplete");
});
/*  Popup/floating footnotes to avoid readers needing to scroll to the end of
    the page to see any footnotes; see
    http://ignorethecode.net/blog/2010/04/20/footnotes/ for details.

    Original author:  Lukas Mathis (2010-04-20)
    License: public domain ("And some people have asked me about a license for
    this piece of code. I think it’s far too short to get its own license, so
    I’m relinquishing any copyright claims. Consider the code to be public
    domain. No attribution is necessary.")
 */

Popups = {
    /**********/
    /*  Config.
     */
    popupContainerID: "popup-container",
    popupContainerParentSelector: "body",
    popupContainerZIndex: "10000",

    popupBreathingRoomX: 12.0,
    popupBreathingRoomY: 8.0,
    popupBreathingRoomYTight: -4.0,

    popupTriggerDelay: 750,
    popupFadeoutDelay: 100,
    popupFadeoutDuration: 250,

	minimizedPopupWidth: 480,
	minimizedPopupsArrangements: {
		vertical: {
			minimizedPopupWidth: 480
		},
		horizontal: {
			minimizedPopupMinWidth: 320,
			minimizedPopupMaxWidth: 640
		}
	},

    /******************/
    /*  Implementation.
     */

    //  Used in: Popups.containingDocumentForTarget
    rootDocument: document,

    popupFadeTimer: false,
    popupDespawnTimer: false,
    popupSpawnTimer: false,
    popupContainer: null,

    popupBeingDragged: null,
    popupBeingResized: null,

    hoverEventsActive: true,

	minimizedPopupsReservedRect: null,

    cleanup: () => {
        GWLog("Popups.cleanup", "popups.js", 1);

        //  Remove popups container.
        Popups.popupContainer?.remove();
        Popups.popupContainer = null;

        //  Remove Escape key event listener.
        document.removeEventListener("keyup", Popups.keyUp);
        //  Remove scroll listener.
        removeScrollListener("disablePopupHoverEventsOnScrollListener");
        //  Remove mousemove listener.
        removeMousemoveListener("enablePopupHoverEventsOnMousemoveListener")
        //  Remove popup-spawn event handler.
        GW.notificationCenter.removeHandlerForEvent("Popups.popupDidSpawn", Popups.addDisablePopupHoverEventsOnScrollListenerOnPopupSpawned);

        //  Fire event.
        GW.notificationCenter.fireEvent("Popups.cleanupDidComplete");
    },

    setup: () => {
        GWLog("Popups.setup", "popups.js", 1);

        //  Run cleanup.
        Popups.cleanup();

        //  Inject popups container.
        let popupContainerParent = document.querySelector(Popups.popupContainerParentSelector);
        if (popupContainerParent == null) {
            GWLog("Popup container parent element not found. Exiting.", "popups.js", 1);
            return;
        }
        Popups.popupContainer = popupContainerParent.appendChild(newElement("DIV", {
            id: Popups.popupContainerID,
            class: "popup-container",
            style: `z-index: ${Popups.popupContainerZIndex};`
        }));

        //  Add window resize listener, to reposition pinned popups.
        addWindowResizeListener(Popups.repositionPopupsOnWindowResize = (event) => {
            Popups.allUnminimizedPopups().forEach(popup => {
                Popups.setPopupViewportRect(popup, popup.viewportRect, { clampPositionToScreen: true });
            });

			Popups.updateMinimizedPopupArrangement();
        }, {
            name: "repositionPopupsOnWindowResizeListener",
            defer: true
        });

        //  Add Escape key event listener.
        document.addEventListener("keyup", Popups.keyUp);

        //  Add scroll listener, to disable hover on scroll.
        addScrollListener(Popups.disablePopupHoverEventsOnScroll = (event) => {
            Popups.hoverEventsActive = false;
        }, {
            name: "disablePopupHoverEventsOnScrollListener"
        });

        /*  Add event handler to add scroll listener to spawned popups, to
            disable hover events when scrolling within a popup.
         */
        GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", Popups.addDisablePopupHoverEventsOnScrollListenerOnPopupSpawned = (info) => {
            addScrollListener(Popups.disablePopupHoverEventsOnScroll, {
                target: info.popup.scrollView
            });
        });

        //  Add mousemove listener, to enable hover on mouse move.
        addMousemoveListener(Popups.enablePopupHoverEventsOnMousemove = (event) => {
            if (   Popups.popupBeingDragged == null
                && Popups.popupBeingResized == null)
                Popups.hoverEventsActive = true;
        }, {
        	name: "enablePopupHoverEventsOnMousemoveListener"
        });

        //  Enable default popup tiling control keys.
        Popups.setPopupTilingControlKeys();

        //  Fire event.
        GW.notificationCenter.fireEvent("Popups.setupDidComplete");
    },

    //  Called by: extracts.js
    addTarget: (target, prepareFunction) => {
        GWLog("Popups.addTarget", "popups.js", 2);

        //  Bind mouseenter/mouseleave/mousedown events.
        target.addEventListener("mouseenter", Popups.targetMouseEnter);
        target.addEventListener("mouseleave", Popups.targetMouseLeave);
        target.addEventListener("mousedown", Popups.targetMouseDown);

        //  Set prepare function.
        target.preparePopup = prepareFunction;

        //  Mark target as spawning a popup.
        target.classList.toggle("spawns-popup", true);
    },

    //  Called by: extracts.js
    removeTarget: (target) => {
        GWLog("Popups.removeTarget", "popups.js", 1);

        //  Unbind existing mouseenter/mouseleave/mousedown events, if any.
        target.removeEventListener("mouseenter", Popups.targetMouseEnter);
        target.removeEventListener("mouseleave", Popups.targetMouseLeave);
        target.removeEventListener("mousedown", Popups.targetMouseDown);

        //  Clear timers for target.
        Popups.clearPopupTimers(target);

        //  Remove spawned popup for target, if any.
        if (target.popup)
            Popups.despawnPopup(target.popup);

        //  Unset popup prepare function.
        target.preparePopup = null;

        //  Un-mark target as spawning a popup.
        target.classList.toggle("spawns-popup", false);
    },

    /*******************/
    /*  General helpers.
     */

    popupContainerIsVisible: () => {
        return (Popups.popupContainer.style.visibility != "hidden");
    },

    //  Called by: extracts-options.js
    hidePopupContainer: () => {
        GWLog("Popups.hidePopupContainer", "popups.js", 3);

        if (Popups.popupContainer) {
            Popups.popupContainer.style.visibility = "hidden";
            Popups.allSpawnedPopups().forEach(popup => {
                Popups.addClassesToPopFrame(popup, "hidden");
            });
        } else {
            GW.notificationCenter.addHandlerForEvent("Popups.setDidComplete", (info) => {
                Popups.hidePopupContainer();
            });
        }
    },

    //  Called by: extracts-options.js
    unhidePopupContainer: () => {
        GWLog("Popups.unhidePopupContainer", "popups.js", 3);

        if (Popups.popupContainer) {
            Popups.popupContainer.style.visibility = "";
            Popups.allSpawnedPopups().forEach(popup => {
                Popups.removeClassesFromPopFrame(popup, "hidden");
            });
        } else {
            GW.notificationCenter.addHandlerForEvent("Popups.setDidComplete", (info) => {
                Popups.unhidePopupContainer();
            });
        }
    },

    updatePageScrollState: () => {
        GWLog("Popups.updatePageScrollState", "popups.js", 2);

        if (Popups.allSpawnedPopups().findIndex(popup => 
        		(   Popups.popupIsMaximized(popup) == true
        		 && Popups.popupIsMinimized(popup) == false)
        	) == -1)
            togglePageScrolling(true);
        else
            togglePageScrolling(false);
    },

    containingDocumentForTarget: (target) => {
        return (Popups.containingPopFrame(target)?.document ?? Popups.rootDocument);
    },

    allSpawnedPopFrames: () => {
        return Popups.allSpawnedPopups();
    },

    //  Called by: extracts.js
    allSpawnedPopups: () => {
        if (Popups.popupContainer == null)
            return [ ];

        return Array.from(Popups.popupContainer.children).filter(
        	(x) => (x.classList.contains("fading") == false)
        ).sort(
			(a, b) => (parseInt(a.style.zIndex) - parseInt(b.style.zIndex))
		);
    },

    //  Called by: extracts.js
    containingPopFrame: (element) => {
        let shadowBody = element.closest(".shadow-body");
        if (shadowBody)
            return shadowBody.popup;

        return element.closest(".popup");
    },

    addClassesToPopFrame: (popup, ...args) => {
        popup.classList.add(...args);
        popup.body.classList.add(...args);
    },

    removeClassesFromPopFrame: (popup, ...args) => {
        popup.classList.remove(...args);
        popup.body.classList.remove(...args);
    },

	popFrameHasClass: (popup, className) => {
		return popup.classList.contains(className);
	},

    /****************************************/
    /*  Visibility of elements within popups.
     */

    /*  Returns true if the given element is currently visible.
     */
    //  Called by: extracts-content.js
    isVisible: (element) => {
        let containingPopup = Popups.containingPopFrame(element);
        return (containingPopup ? isWithinRect(element, containingPopup.getBoundingClientRect()) : isOnScreen(element));
    },

    //  Called by: extracts.js
    scrollElementIntoViewInPopFrame: (element, alwaysRevealTopEdge = false) => {
        let popup = Popups.containingPopFrame(element);

        let elementRect = element.getBoundingClientRect();
        let popupBodyRect = popup.body.getBoundingClientRect();
        let popupScrollViewRect = popup.scrollView.getBoundingClientRect();

        let bottomBound = alwaysRevealTopEdge ? elementRect.top : elementRect.bottom;
        if (   popup.scrollView.scrollTop                              >= elementRect.top    - popupBodyRect.top
            && popup.scrollView.scrollTop + popupScrollViewRect.height <= bottomBound - popupBodyRect.top)
            return;

        popup.scrollView.scrollTop = elementRect.top - popupBodyRect.top;
    },

    /*******************************/
    /*  Popup spawning & despawning.
     */

    newPopup: (target) => {
        GWLog("Popups.newPopup", "popups.js", 2);

        //  Create popup, scroll view, content view, shadow root, shadow body.
        let popup = newElement("DIV", { class: "popup popframe" }, { spawningTarget: target });
        popup.scrollView = popup.appendChild(newElement("DIV", { class: "popframe-scroll-view" }));
        popup.contentView = popup.scrollView.appendChild(newElement("DIV", { class: "popframe-content-view" }));
        popup.document = popup.contentView.attachShadow({ mode: "open" });
        popup.document.body = popup.body = popup.shadowBody = popup.document.appendChild(newElement("DIV", {
            class: "popframe-body popup-body shadow-body"
        }));

        //  Set reverse references.
        popup.document.popup = popup.body.popup = popup.contentView.popup = popup.scrollView.popup = popup;

        //  Inject style reset.
        popup.document.insertBefore(newElement("STYLE", null, { innerHTML: `.shadow-body { all: initial; }` }), popup.body);

        //  Default empty title bar.
        popup.titleBarContents = [ ];

        //  Loading spinner and “loading failed” message views.
        popup.loadingSpinnerView = popup.appendChild(newElement("DIV", { class: "popframe-loading-spinner-view" }));
        popup.loadingFailedMessageView = popup.appendChild(newElement("DIV", { class: "popframe-loading-failed-message-view" }));

        return popup;
    },

    //  Called by: extracts.js
    //  Called by: extracts-content.js
    setPopFrameContent: (popup, content) => {
        if (content) {
            popup.body.replaceChildren(content);

            return true;
        } else {
            return false;
        }
    },

    //  Called by: extracts.js
    //  Called by: extracts-annotations.js
    spawnPopup: (target, spawnPoint) => {
        GWLog("Popups.spawnPopup", "popups.js", 2);

        //  Prevent spawn attempts before setup complete.
        if (Popups.popupContainer == null)
            return;

        //  Set wait cursor.
        Popups.setWaitCursorForTarget(target);

        //  Despawn existing popup, if any.
        if (target.popup)
            Popups.despawnPopup(target.popup);

        //  Create the new popup.
        let popup = Popups.newPopup(target);

        //  Prepare the newly created popup for spawning.
        if (popup = target.preparePopup(popup)) {
            //  Attach popup to target.
            Popups.attachPopupToTarget(popup, target);
        } else {
            //  Reset cursor to normal.
            Popups.clearWaitCursorForTarget(target);

            //  Preparation failed, so do nothing.
            return;
        }

        /*  Once this popup is spawned, despawn all non-pinned popups not in
            this popup’s stack.
         */
        GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", (info) => {
            Popups.allSpawnedPopups().forEach(spawnedPopup => {
                if (   Popups.popupIsPinned(spawnedPopup) == false
                    && target.popup.popupStack.indexOf(spawnedPopup) == -1)
                    Popups.despawnPopup(spawnedPopup);
            });
        }, {
            once: true,
            condition: (info) => (info.popup == popup)
        });

        //  If title bar contents are provided, add a title bar (if needed).
        if (   popup.titleBar == null
            && popup.titleBarContents.length > 0)
            Popups.addTitleBarToPopup(popup);

        if (popup.parentElement == Popups.popupContainer) {
            //  If the popup is an existing popup, just bring it to the front.
            Popups.bringPopupToFront(popup);
        } else {
            //  Otherwise, inject the popup into the page.
            Popups.injectPopup(popup);
        }

        //  Default spawn location (in case popup was spawned programmatically).
        if (spawnPoint == null) {
            let targetRect = target.getBoundingClientRect();
            spawnPoint = {
                x: targetRect.x,
                y: targetRect.y
            };
        }

        //  Position the popup appropriately with respect to the target.
        Popups.positionPopup(popup, { spawnPoint: spawnPoint });

        //  Fire notification event.
        GW.notificationCenter.fireEvent("Popups.popupDidSpawn", { popup: popup });

        requestAnimationFrame(() => {
            //  Reset cursor to normal.
            Popups.clearWaitCursorForTarget(target);
        });

        return popup;
    },

    injectPopup: (popup) => {
        GWLog("Popups.injectPopup", "popups.js", 2);

        //  Add popup to a popup stack.
        if (popup.popupStack == null) {
            let parentPopup = Popups.containingPopFrame(popup.spawningTarget);
            popup.popupStack = parentPopup ? parentPopup.popupStack : [ ];
        } else {
            popup.popupStack.remove(popup);
        }
        popup.popupStack.push(popup);

        //  Inject popup into page.
        Popups.popupContainer.appendChild(popup);

        //  Bring popup to front.
        Popups.bringPopupToFront(popup);

        //  Cache border width.
        popup.borderWidth = parseFloat(getComputedStyle(popup).borderLeftWidth);

        //  Add event listeners.
        popup.addEventListener("click", Popups.popupClicked);
        popup.addEventListener("mouseenter", Popups.popupMouseEnter);
        popup.addEventListener("mouseleave", Popups.popupMouseLeave);
        popup.addEventListener("mouseout", Popups.popupMouseOut);
        popup.addEventListener("mousedown", Popups.popupMouseDown);

        //  We define the mousemove listener here in order to capture `popup`.
        addMousemoveListener(Popups.popupMouseMove = (event) => {
            GWLog("Popups.popupMouseMove", "popups.js", 3);

            if (   event.target == popup
                && Popups.popupBeingDragged == null
                && Popups.popupBeingResized == null
                && Popups.popupIsResizeable(popup)) {
                //  Mouse position is relative to the popup’s coordinate system.
                let edgeOrCorner = Popups.edgeOrCorner(popup, {
                    x: event.clientX - popup.viewportRect.left,
                    y: event.clientY - popup.viewportRect.top
                });

                //  Set cursor.
                document.documentElement.style.cursor = Popups.cursorForPopupBorder(edgeOrCorner);
            }
        }, { target: popup });
    },

    //  Called by: Popups.spawnPopup
    //  Called by: extracts.js
    attachPopupToTarget: (popup, target) => {
        GWLog("Popups.attachPopupToTarget", "popups.js", 2);

        target = target ?? popup.spawningTarget;

        //  Clear timers.
        Popups.clearPopupTimers(target);

        target.classList.add("popup-open");
        target.popup = popup;
        target.popFrame = popup;

        popup.spawningTarget = target;
    },

    //  Called by: Popups.spawnPopup
    //  Called by: Popups.despawnPopup
    //  Called by: Popups.pinPopup
    //  Called by: extracts.js
    detachPopupFromTarget: (popup, target) => {
        GWLog("Popups.detachPopupFromTarget", "popups.js", 2);

        target = target ?? popup.spawningTarget;

        //  Clear timers.
        Popups.clearPopupTimers(target);

        //  Reset cursor to normal.
        Popups.clearWaitCursorForTarget(target);

        target.classList.remove("popup-open");
        target.popup = null;
        target.popFrame = null;
    },

    despawnPopup: (popup) => {
        GWLog("Popups.despawnPopup", "popups.js", 2);

        if (popup.isDespawned)
            return;

        GW.notificationCenter.fireEvent("Popups.popupWillDespawn", { popup: popup });

        //  Detach popup from its spawning target.
        Popups.detachPopupFromTarget(popup);

        //  Remove popup from the page.
        popup.remove();

        //  Remove popup from its popup stack.
        popup.popupStack.remove(popup);
        popup.popupStack = null;

        //  Mark popup as despawned.
        popup.isDespawned = true;

        //  Update z-indexes of all popups.
        Popups.updatePopupsZOrder();

        //  Focus the front-most popup (preferring un-minimized ones).
        Popups.focusPopup(Popups.frontmostPopup({ includeMinimizedPopups: true }));

		/*	If the de-spawned popup was minimized, update arrangement of
			remaining minimized popups.
		 */
		if (Popups.popupIsMinimized(popup))
			Popups.updateMinimizedPopupArrangement();

        //  Enable/disable main document scrolling.
        Popups.updatePageScrollState();

        document.activeElement.blur();
    },

    //  Called by: extracts.js
    popFrameStateLoading: (popup) => {
        return popin.classList.contains("loading");
    },

    //  Called by: extracts.js
    popFrameStateLoadingFailed: (popup) => {
        return popup.classList.contains("loading-failed");
    },

    //  Called by: extracts.js
    setPopFrameStateLoading: (popup) => {
        Popups.removeClassesFromPopFrame(popup, "loading-failed");
        Popups.addClassesToPopFrame(popup, "loading");
    },

    //  Called by: extracts.js
    setPopFrameStateLoadingFailed: (popup) => {
        Popups.removeClassesFromPopFrame(popup, "loading");
        Popups.addClassesToPopFrame(popup, "loading-failed");
    },

    //  Called by: extracts.js
    clearPopFrameState: (popup) => {
        Popups.removeClassesFromPopFrame(popup, "loading", "loading-failed");
    },

    getPopupAncestorStack: (popup) => {
        let indexOfPopup = popup.popupStack.indexOf(popup);
        if (indexOfPopup != -1) {
            return popup.popupStack.slice(0, indexOfPopup + 1);
        } else {
            let parentPopup = Popups.containingPopFrame(popup.spawningTarget);
            return ((parentPopup && parentPopup.popupStack)
                    ? Popups.getPopupAncestorStack(parentPopup)
                    : [ ]);
        }
    },

    isSpawned: (popup) => {
        return (   popup != null
                && popup.parentElement != null
                && popup.classList.contains("fading") == false);
    },

	/**********************/
	/*	Popup minimization.
	 */

	popupIsMinimized: (popup) => {
		return popup.classList.contains("minimized");
	},

	/*	All minimized popups, in order of their position in the minimized
		popups stack.
	 */
	allMinimizedPopups: () => {
		return Popups.allSpawnedPopups().filter(
			(x) => (Popups.popupIsMinimized(x) == true)
		).sort(
			(a, b) => (parseInt(a.style.zIndex) - parseInt(b.style.zIndex))
		);
	},

	/*	All unminimized popups, in z-order (backmost to frontmost).
	 */
	allUnminimizedPopups: () => {
		return Popups.allSpawnedPopups().filter(
			(x) => (Popups.popupIsMinimized(x) == false)
		).filter(
			(x) => (x.style.zIndex > "")
		).sort(
			(a, b) => (parseInt(a.style.zIndex) - parseInt(b.style.zIndex))
		);
	},

	minimizeOrUnminimizePopup: (popup) => {
        GWLog("Popups.minimizeOrUnminimizePopup", "popups.js", 2);

        if (Popups.popupIsMinimized(popup)) {
            Popups.unminimizePopup(popup);
        } else {
            Popups.minimizePopup(popup);
        }

        //  Cache the viewport rect.
        popup.viewportRect = popup.getBoundingClientRect();
	},

	minimizePopup: (popup) => {
        GWLog("Popups.minimizePopup", "popups.js", 3);

		if (Popups.popupIsMinimized(popup) == true)
			return;

		//	Save position.
		Popups.savePopupPosition(popup);

        //	Collapse popup, if need be; else save collapse state.
        if (Popups.popupIsCollapsed(popup)) {
        	popup.popupWasCollapsedBeforeMinimization = true;
        } else {
	        Popups.collapsePopup(popup, { updateTitleBarState: false });
	    }

		//	Unfocus popup.
		Popups.unfocusPopup(popup);

        //  Save and unset width, if need be.
        if (popup.style.width) {
            popup.dataset.previousWidth = popup.style.width;
            popup.style.width = "";
        }

		//	Save mini-title-bar state, if need be.
		if (popup.classList.contains("mini-title-bar")) {
			popup.popupHadMiniTitleBar = true;
			popup.classList.remove("mini-title-bar");
		}

		//	Set id number.
		popup.dataset.minimizedPopupId = Popups.allMinimizedPopups().length + 1;

        //  Update class.
        Popups.addClassesToPopFrame(popup, "minimized");

        //  Update title bar buttons states (if any).
        if (popup.titleBar)
            popup.titleBar.updateState();

		//	Update minimized popup arrangement.
		Popups.updateMinimizedPopupArrangement();

        //  Focus the front-most popup (preferring un-minimized ones).
        Popups.focusPopup(Popups.frontmostPopup({ includeMinimizedPopups: true }));

        //  Enable/disable main document scrolling.
        Popups.updatePageScrollState();
	},

	unminimizePopup: (popup) => {
        GWLog("Popups.unminimizePopup", "popups.js", 3);

		if (Popups.popupIsMinimized(popup) == false)
			return;

        //  Update class.
        Popups.removeClassesFromPopFrame(popup, "minimized");

		//	Delete id number.
		delete popup.dataset["minimizedPopupId"];

		//	Restore mini-title-bar state, if need be.
		if (popup.popupHadMiniTitleBar) {
			popup.classList.add("mini-title-bar");
			popup.popupHadMiniTitleBar = null;
		}

        //  Restore width and delete saved width, if need be.
        if (popup.dataset.previousWidth) {
			popup.style.width = popup.dataset.previousWidth;
            delete popup.dataset["previousWidth"];
        } else {
        	popup.style.width = "";
        }

		//	Un-unset minimum width.
		popup.style.minWidth = "";

        //	Uncollapse popup, if need be; else clear saved collapse state.
        if (popup.popupWasCollapsedBeforeMinimization) {
        	popup.popupWasCollapsedBeforeMinimization = null;
        } else {
			Popups.uncollapsePopup(popup, { updateTitleBarState: false });
		}

		//	Restore popup position.
		Popups.addClassesToPopFrame(popup, "unminimized");
		Popups.positionPopup(popup);

        //  Update title bar buttons states (if any).
        if (popup.titleBar)
            popup.titleBar.updateState();

		//	Update minimized popup arrangement.
		Popups.updateMinimizedPopupArrangement();

        //  Enable/disable main document scrolling.
        Popups.updatePageScrollState();
	},

	updateMinimizedPopupArrangement: () => {
		let minimizedPopups = Popups.allMinimizedPopups();

		//	Select arrangement for minimized popups.
		let arrangement;
		if (Popups.minimizedPopupsArrangements.vertical.minimizedPopupWidth > (window.innerWidth - document.querySelector("main").offsetWidth) * 0.5) {
			arrangement = Popups.minimizedPopupsArrangements.horizontal;
		} else if (window.innerHeight >= (window.innerWidth - Popups.minimizedPopupsArrangements.vertical.minimizedPopupWidth)) {
			arrangement = Popups.minimizedPopupsArrangements.horizontal;
		} else {
			arrangement = Popups.minimizedPopupsArrangements.vertical;
		}

		//	Determine width of the widest minimized popup.
		let maxPopupWidth = minimizedPopups.reduce((maxWidth, popup) => Math.max(maxWidth, popup.viewportRect.width), 0);

		//	Arrange minimized popups.
		let minimizedPopupWidth;
		if (arrangement == Popups.minimizedPopupsArrangements.vertical) {
			minimizedPopupWidth = Math.min(arrangement.minimizedPopupWidth, maxPopupWidth);
		} else if (arrangement == Popups.minimizedPopupsArrangements.horizontal) {
			maxPopupWidth = Math.min(maxPopupWidth, arrangement.minimizedPopupMaxWidth);
			if (minimizedPopups.length <= Math.floor(window.innerWidth / maxPopupWidth)) {
				minimizedPopupWidth = maxPopupWidth;
			} else if (window.innerWidth > minimizedPopups.length * arrangement.minimizedPopupMinWidth) {
				minimizedPopupWidth = Math.floor(window.innerWidth / minimizedPopups.length);
			} else {
				minimizedPopupWidth = Math.floor(window.innerWidth / Math.floor(window.innerWidth / arrangement.minimizedPopupMinWidth));
			}
		}
		let xOffset = 0
		let yOffset = 0;
		for (let i = 0; i < minimizedPopups.length; i++) {
			let popup = minimizedPopups[i];

			popup.dataset.minimizedPopupId = i + 1;

			let newPopupRect = new DOMRect(xOffset, window.innerHeight - (yOffset + popup.offsetHeight), 0, 0);
			popup.style.width = minimizedPopupWidth + "px";
			popup.style.minWidth = "unset";

			if (arrangement == Popups.minimizedPopupsArrangements.vertical) {
				yOffset += popup.offsetHeight;
			} else if (arrangement == Popups.minimizedPopupsArrangements.horizontal) {
				xOffset += minimizedPopupWidth;
				if (xOffset + minimizedPopupWidth > window.innerWidth) {
					xOffset = 0;
					yOffset += popup.offsetHeight;
				}
			}

			//	Set and cache the viewport rect.
			Popups.setPopupViewportRect(popup, newPopupRect);
			popup.viewportRect = popup.getBoundingClientRect();

			//	Set z-index (skip focused popup, if any).
			if (Popups.popupIsFocused(popup) == false)
				popup.style.zIndex = popup.dataset.minimizedPopupId;
		}
	},

    /********************/
    /*  Popup collapsing.
     */
    popupIsCollapsed: (popup) => {
        return popup.classList.contains("collapsed");
    },

    collapseOrUncollapsePopup: (popup) => {
        GWLog("Popups.collapseOrUncollapsePopup", "popups.js", 2);

        if (Popups.popupIsCollapsed(popup)) {
            Popups.uncollapsePopup(popup);
        } else {
            Popups.collapsePopup(popup);
        }

		//  Cache the viewport rect.
		popup.viewportRect = popup.getBoundingClientRect();
    },

    collapsePopup: (popup, options) => {
        GWLog("Popups.collapsePopup", "popups.js", 3);

		if (Popups.popupIsCollapsed(popup) == true)
			return;

		options = Object.assign({
			updateTitleBarState: true
		}, options);

        //  Save and unset height, if need be.
        if (popup.style.height) {
            popup.dataset.previousHeight = popup.style.height;
            popup.style.height = "";
        }

        //  Pin popup.
        Popups.pinPopup(popup);

        //  Update class.
        Popups.addClassesToPopFrame(popup, "collapsed");

        //  Clear timers.
        Popups.clearPopupTimers(popup.spawningTarget);

        //  Update title bar buttons states (if any).
        if (   popup.titleBar 
        	&& options.updateTitleBarState == true)
            popup.titleBar.updateState();

		//	If this popup is minimized, update minimized popup arrangement.
		if (Popups.popupIsMinimized(popup))
			Popups.updateMinimizedPopupArrangement();
    },

    uncollapsePopup: (popup, options) => {
        GWLog("Popups.uncollapsePopup", "popups.js", 3);

		if (Popups.popupIsCollapsed(popup) == false)
			return;

		options = Object.assign({
			updateTitleBarState: true
		}, options);

        //  Update class.
        Popups.removeClassesFromPopFrame(popup, "collapsed");

        //  Restore height and delete saved height, if need be.
        if (popup.dataset.previousHeight) {
			popup.style.height = popup.dataset.previousHeight;
            delete popup.dataset["previousHeight"];
        }

        //  Clear timers.
        Popups.clearPopupTimers(popup.spawningTarget);

        //  Update title bar buttons states (if any).
        if (   popup.titleBar 
        	&& options.updateTitleBarState == true)
            popup.titleBar.updateState();

		//	Re-clamp popup to screen.
		Popups.setPopupViewportRect(popup, new DOMRect(popup.viewportRect.x, popup.viewportRect.y, 0, 0), { clampPositionToScreen: true });

		//	If this popup is minimized, update minimized popup arrangement.
		if (Popups.popupIsMinimized(popup))
			Popups.updateMinimizedPopupArrangement();
    },

    /********************************************************/
    /*  Popup pinning/unpinning, zooming/tiling, & restoring.
     */

    /*  Popup tiling control keys.
     */
    popupTilingControlKeys: (localStorage.getItem("popup-tiling-control-keys") || ""),

    setPopupTilingControlKeys: (keystring) => {
        GWLog("Popups.setPopupTilingControlKeys", "popups.js", 1);

        Popups.popupTilingControlKeys = keystring ?? "aswdqexzfrcvtgb";
        localStorage.setItem("popup-tiling-control-keys", Popups.popupTilingControlKeys);
    },

    popupIsResizeable: (popup) => {
        return (   Popups.popupIsPinned(popup) == true
        		&& Popups.popupIsMinimized(popup) == false
                && (   Popups.popupAllowsHorizontalResize(popup)
                    || Popups.popupAllowsVerticalResize(popup)));
    },

    popupAllowsHorizontalResize: (popup) => {
        return (popup.classList.contains("no-resize-width") == false);
    },

    popupAllowsVerticalResize: (popup) => {
        return (   popup.classList.contains("no-resize-height") == false
                && Popups.popupIsCollapsed(popup) == false);
    },

    popupIsZoomed: (popup) => {
        return popup.classList.contains("zoomed");
    },

    popupIsZoomedToPlace: (popup, place) => {
        return (   popup.classList.contains("zoomed")
                && popup.classList.contains(place));
    },

    popupIsMaximized: (popup) => {
        return (popup.classList.contains("zoomed") && popup.classList.contains("full"));
    },

    popupIsPinned: (popup) => {
        return popup.classList.contains("pinned");
    },

    zoomPopup: (popup, place) => {
        GWLog("Popups.zoomPopup", "popups.js", 2);

        //  If popup isn’t already zoomed, save position.
        if (Popups.popupIsZoomed(popup) == false)
            Popups.savePopupPosition(popup);

        //  If the popup is collapsed, expand it.
        if (Popups.popupIsCollapsed(popup))
            Popups.uncollapsePopup(popup);

        //  Update classes.
        Popups.removeClassesFromPopFrame(popup, "restored", ...(Popups.titleBarComponents.popupPlaces));
        Popups.addClassesToPopFrame(popup, "zoomed", place);

        //  Viewport width must account for vertical scroll bar.
        let viewportWidth = document.documentElement.offsetWidth;
        let viewportHeight = window.innerHeight;
        switch (place) {
            case "top-left":
                popup.zoomToX = 0.0;
                popup.zoomToY = 0.0;
                break;
            case "top":
                popup.zoomToX = 0.0;
                popup.zoomToY = 0.0;
                break;
            case "top-right":
                popup.zoomToX = viewportWidth / 2.0;
                popup.zoomToY = 0.0;
                break;
            case "left":
                popup.zoomToX = 0.0;
                popup.zoomToY = 0.0;
                break;
            case "full":
                popup.zoomToX = 0.0;
                popup.zoomToY = 0.0;
                break;
            case "right":
                popup.zoomToX = viewportWidth / 2.0;
                popup.zoomToY = 0.0;
                break;
            case "bottom-left":
                popup.zoomToX = 0.0;
                popup.zoomToY = viewportHeight / 2.0;
                break;
            case "bottom":
                popup.zoomToX = 0.0;
                popup.zoomToY = viewportHeight / 2.0;
                break;
            case "bottom-right":
                popup.zoomToX = viewportWidth / 2.0;
                popup.zoomToY = viewportHeight / 2.0;
                break;
        }

        //  Update popup size.
        popup.style.maxWidth = "unset";
        popup.style.maxHeight = "unset";
        switch (place) {
            case "full":
                popup.style.width = "100%";
                popup.style.height = "100vh";
                break;
            case "left":
            case "right":
                popup.style.width = "50%";
                popup.style.height = "100vh";
                break;
            case "top":
            case "bottom":
                popup.style.width = "100%";
                popup.style.height = "50vh";
                break;
            case "top-left":
            case "top-right":
            case "bottom-left":
            case "bottom-right":
                popup.style.width = "50%";
                popup.style.height = "50vh";
                break;
        }

        //  Pin (or re-pin) popup. (This also updates the popup’s position.)
        Popups.unpinPopup(popup);
        Popups.pinPopup(popup);

        //  Clear timers.
        Popups.clearPopupTimers(popup.spawningTarget);

        //  Enable/disable main document scrolling.
        Popups.updatePageScrollState();

        //  Update title bar buttons states (if any).
        if (popup.titleBar)
            popup.titleBar.updateState();
    },

    restorePopup: (popup) => {
        GWLog("Popups.restorePopup", "popups.js", 2);

        //  Update classes.
        Popups.removeClassesFromPopFrame(popup, "zoomed", "resized", ...(Popups.titleBarComponents.popupPlaces));
        Popups.addClassesToPopFrame(popup, "restored");

        //  Update popup size.
        popup.style.width = "";
        popup.style.height = "";
        popup.style.maxWidth = "";
        popup.style.maxHeight = "";

        //  Update popup position.
        Popups.positionPopup(popup);

        //  Clear timers.
        Popups.clearPopupTimers(popup.spawningTarget);

        //  Enable/disable main document scrolling.
        Popups.updatePageScrollState();

        //  Update title bar buttons states (if any).
        if (popup.titleBar)
            popup.titleBar.updateState();
    },

    pinOrUnpinPopup: (popup) => {
        GWLog("Popups.pinOrUnpinPopup", "popups.js", 2);

        if (Popups.popupIsPinned(popup) == true) {
            Popups.unpinPopup(popup);
        } else {
            Popups.pinPopup(popup);
        }
    },

    pinPopup: (popup) => {
        GWLog("Popups.pinPopup", "popups.js", 2);

		if (Popups.popupIsPinned(popup) == true)
			return;

        popup.swapClasses([ "pinned", "unpinned" ], 0);
        Popups.positionPopup(popup);
        popup.popupStack.remove(popup);
        Popups.detachPopupFromTarget(popup);

		if (Popups.keepPopupAttachedOnPin(popup.spawningTarget) == true)
			Popups.attachPopupToTarget(popup, popup.spawningTarget);

        popup.titleBar.updateState();
    },

    unpinPopup: (popup) => {
        GWLog("Popups.unpinPopup", "popups.js", 2);

		if (Popups.popupIsPinned(popup) == false)
			return;

        popup.swapClasses([ "pinned", "unpinned" ], 1);
        Popups.positionPopup(popup);
        popup.popupStack.push(popup);

		if (Popups.keepPopupAttachedOnPin(popup.spawningTarget) == false)
			Popups.attachPopupToTarget(popup);

        popup.titleBar.updateState();
    },

    /******************/
    /*  Popup resizing.
     */

    popupWasResized: (popup) => {
        return popup.classList.contains("resized");
    },

    edgeOrCorner: (popup, relativeMousePos) => {
        if (Popups.popupAllowsHorizontalResize(popup) == false) {
            let cornerHandleSize = popup.borderWidth;

                   if (relativeMousePos.y < cornerHandleSize) {
                return "edge-top";
            } else if (relativeMousePos.y > popup.viewportRect.height - cornerHandleSize) {
                return "edge-bottom";
            } else {
                return "";
            }
        } else if (Popups.popupAllowsVerticalResize(popup) == false) {
            let cornerHandleSize = popup.borderWidth;

                   if (relativeMousePos.x < cornerHandleSize) {
                return "edge-left";
            } else if (relativeMousePos.x > popup.viewportRect.width - cornerHandleSize) {
                return "edge-right";
            } else {
                return "";
            }
        } else {
            //  Make corner drag areas big enough to make a decent mouse target.
            let cornerHandleSize = Math.min(20.0, (Math.min(popup.viewportRect.width, popup.viewportRect.height) / 3.0));

                   if (   relativeMousePos.x < cornerHandleSize
                       && relativeMousePos.y < cornerHandleSize) {
                return "corner-top-left";
            } else if (   relativeMousePos.x > popup.viewportRect.width - cornerHandleSize
                       && relativeMousePos.y > popup.viewportRect.height - cornerHandleSize) {
                return "corner-bottom-right";
            } else if (   relativeMousePos.x < cornerHandleSize
                       && relativeMousePos.y > popup.viewportRect.height - cornerHandleSize) {
                return "corner-bottom-left";
            } else if (   relativeMousePos.x > popup.viewportRect.width - cornerHandleSize
                       && relativeMousePos.y < cornerHandleSize) {
                return "corner-top-right";
            } else if (relativeMousePos.x < cornerHandleSize) {
                return "edge-left";
            } else if (relativeMousePos.x > popup.viewportRect.width - cornerHandleSize) {
                return "edge-right";
            } else if (relativeMousePos.y < cornerHandleSize) {
                return "edge-top";
            } else if (relativeMousePos.y > popup.viewportRect.height - cornerHandleSize) {
                return "edge-bottom";
            } else {
                return "";
            }
        }
    },

    cursorForPopupBorder: (edgeOrCorner) => {
        switch (edgeOrCorner) {
        case "edge-top":
        case "edge-bottom":
            return "row-resize";
        case "edge-left":
        case "edge-right":
            return "col-resize";
        case "corner-top-left":
        case "corner-bottom-right":
            return "nwse-resize";
        case "corner-top-right":
        case "corner-bottom-left":
            return "nesw-resize";
        default:
            return "";
        }
    },

    /*******************/
    /*  Popup title bar.
     */

    /*  Add title bar to a popup which has a populated .titleBarContents.
     */
    addTitleBarToPopup: (popup) => {
        GWLog("Popups.addTitleBarToPopup", "popups.js", 2);

        //  Set class ‘has-title-bar’ on the popup.
        popup.classList.add("has-title-bar");

        //  Create and inject the title bar element.
        popup.titleBar = newElement("DIV", {
            class: "popframe-title-bar",
            title: Popups.titleBarComponents.standardTooltip
        });
        popup.insertBefore(popup.titleBar, popup.firstElementChild);

        //  Add the provided title bar contents (buttons, title, etc.).
        popup.titleBarContents.forEach(element => {
            popup.titleBar.appendChild(element);

            if (element.buttonAction)
                element.addActivateEvent(element.buttonAction);

            //  Add popup-positioning submenu to zoom button.
            if (   element.classList.contains("zoom-button")
                && element.submenuEnabled)
                Popups.titleBarComponents.addSubmenuToButton(element, "zoom-button-submenu", Popups.titleBarComponents.popupZoomButtons());
        });

        //  Add state-updating function.
        popup.titleBar.updateState = () => {
			//	Update title bar tooltip.
        	if (Popups.popupIsMinimized(popup)) {
	        	popup.titleBar.title = Popups.titleBarComponents.minimizedTooltip;
	        } else if (Popups.popupIsCollapsed(popup)) {
	        	popup.titleBar.title = Popups.titleBarComponents.standardTooltip.replaceAll("collapse", "expand");
	        } else {
	        	popup.titleBar.title = Popups.titleBarComponents.standardTooltip;
	        }

			//	Update title bar button states.
            popup.titleBar.querySelectorAll("button").forEach(button => {
                if (button.updateState)
                    button.updateState();
            });
        };

        //  Add event listeners for dragging the popup by the title bar.
        popup.titleBar.addEventListener("mousedown", Popups.popupTitleBarMouseDown);
        popup.titleBar.addEventListener("mouseup", Popups.popupTitleBarMouseUp);

		//	Add click event listener for un-minimizing a minimized popup.
		popup.titleBar.addEventListener("click", Popups.popupTitleBarClicked);

        //  Add double-click event listener for collapsing/uncollapsing the popup.
        popup.titleBar.addEventListener("dblclick", Popups.popupTitleBarDoubleClicked);
    },

    /*  Elements and methods related to popup title bars.
     */
    titleBarComponents: {
		standardTooltip: "Drag popup by title bar to reposition; [v]: double-click title bar to collapse (hold [⌥/Alt] to collapse all)",
		minimizedTooltip: "Click to un-minimize (hold [⌥/Alt] to un-minimize all)",

        //  The standard positions for a popup to zoom to.
        popupPlaces: [ "top-left", "top", "top-right", "left", "full", "right", "bottom-left", "bottom", "bottom-right" ],

        getButtonIcon: (buttonType) => {
            let icon = Popups.titleBarComponents.buttonIcons[buttonType];
            return icon.startsWith("<") ? icon : GW.svg(icon);
        },

        /*  Icons for various popup title bar buttons.
            (Values are keys for GW.svg().)
         */
        buttonIcons: {
            "close": "window-close",
            "zoom": "arrows-maximize-solid",
            "restore": "compress-solid",
            "pin": "thumbtack-regular",
            "unpin": "thumbtack-solid",
            "options": "gear-solid",
            "zoom-top-left": "expand-arrows-up-left",
            "zoom-top": "expand-arrows-up",
            "zoom-top-right": "expand-arrows-up-right",
            "zoom-left": "expand-arrows-left",
            "zoom-full": "arrows-maximize-solid",
            "zoom-right": "expand-arrows-right",
            "zoom-bottom-left": "expand-arrows-down-left",
            "zoom-bottom": "expand-arrows-down",
            "zoom-bottom-right": "expand-arrows-down-right",
            "minimize": "window-minimize",
            "unminimize": "window-maximize"
        },

        //  Tooltip text for various popup title bar icons.
        buttonTitles: {
            "close": "[Esc]: Close this popup (hold [⌥/Alt] to close all)",
            "zoom": "[f]: Maximize this popup to fill the screen",
            "restore": "[r]: Restore this popup to normal size and position",
            "pin": "[c]: Pin this popup to the screen (hold [⌥/Alt] to pin all)",
            "unpin": "[c]: Un-pin (if pinned) this popup from the screen (hold [⌥/Alt] to un-pin all)",
            "options": "Show options", // NOTE: feature & button currently disabled, and no keybinding
            "zoom-top-left": "[q]: Place this popup in the top-left quarter of the screen",
            "zoom-top": "[w]: Place this popup on the top half of the screen",
            "zoom-top-right": "[e]: Place this popup in the top-right quarter of the screen",
            "zoom-left": "[a]: Place this popup on the left half of the screen",
            "zoom-right": "[d]: Place this popup on the right half of the screen",
            "zoom-full": "[f]: Maximize this popup to fill the screen",
            "zoom-bottom-left": "[z]: Place this popup in the bottom-left quarter of the screen",
            "zoom-bottom": "[s]: Place this popup on the bottom half of the screen",
            "zoom-bottom-right": "[x]: Place this popup in the bottom-right quarter of the screen",
            "minimize": "[t]: Minimize this button to the bottom of the screen (hold [⌥/Alt] to minimize all)",
            "unminimize": "[t]: Un-minimize this button, restoring it to its previous position (hold [⌥/Alt] to un-minimize all)"
        },

        //  A generic button, with no icon or tooltip text.
        genericButton: () => {
            let button = newElement("BUTTON", {
                class: "popframe-title-bar-button",
                tabindex: "-1"
            });

            button.buttonAction = (event) => { event.stopPropagation(); };

            return button;
        },

        //  Close button.
        closeButton: () => {
            let button = Popups.titleBarComponents.genericButton();

            button.classList.add("close-button");
            button.innerHTML = Popups.titleBarComponents.getButtonIcon("close");
            button.title = Popups.titleBarComponents.buttonTitles["close"];

            button.buttonAction = (event) => {
                event.stopPropagation();

                if (event.altKey == true) {
                    Popups.allSpawnedPopups().forEach(popup => {
                        Popups.despawnPopup(popup);
                    });
                } else {
                    Popups.despawnPopup(Popups.containingPopFrame(event.target));
                }
            };

            return button;
        },

        //  Zoom button (with submenu).
        zoomButton: () => {
            let button = Popups.titleBarComponents.genericButton();

            button.classList.add("zoom-button", "zoom");

            button.defaultHTML = Popups.titleBarComponents.getButtonIcon("zoom");
            button.alternateHTML = Popups.titleBarComponents.getButtonIcon("restore");
            button.innerHTML = button.defaultHTML;

            button.defaultTitle = Popups.titleBarComponents.buttonTitles["zoom"];
            button.alternateTitle = Popups.titleBarComponents.buttonTitles["restore"];
            button.title = button.defaultTitle;

            button.buttonAction = (event) => {
                event.stopPropagation();

                let popup = Popups.containingPopFrame(button);

                if (button.classList.contains("zoom")) {
                    Popups.zoomPopup(popup, "full");
                } else {
                    Popups.restorePopup(popup);
                }
            };

            button.updateState = () => {
                let popup = Popups.containingPopFrame(button);

                let alternateStateEnabled = (Popups.popupIsZoomed(popup) || Popups.popupWasResized(popup));

                button.innerHTML = alternateStateEnabled ? button.alternateHTML : button.defaultHTML;
                button.title = alternateStateEnabled ? button.alternateTitle : button.defaultTitle;

                button.swapClasses([ "zoom", "restore" ], (alternateStateEnabled ? 1 : 0));

                if (button.submenuEnabled == true) {
                    button.submenu.querySelectorAll(".submenu-button").forEach(submenuButton => {
                        submenuButton.updateState();
                    });
                }

				button.disabled = (Popups.popupIsMinimized(popup));
            };

            button.enableSubmenu = () => {
                button.submenuEnabled = true;
                return button;
            };

            return button;
        },

        //  Zoom buttons (to be put into zoom button submenu).
        popupZoomButtons: () => {
            return Popups.titleBarComponents.popupPlaces.map(place => {
                let button = Popups.titleBarComponents.genericButton();

                button.classList.add("submenu-button", "zoom-button", place);

                button.defaultHTML = Popups.titleBarComponents.getButtonIcon(`zoom-${place}`);
                button.alternateHTML = Popups.titleBarComponents.getButtonIcon("restore");
                button.innerHTML = button.defaultHTML;

                button.defaultTitle = Popups.titleBarComponents.buttonTitles[`zoom-${place}`];
                button.alternateTitle = Popups.titleBarComponents.buttonTitles["restore"];
                button.title = button.defaultTitle;

                button.buttonAction = (event) => {
                    event.stopPropagation();

                    let popup = Popups.containingPopFrame(button);

                    if (button.classList.contains(`zoom-${place}`)) {
                        Popups.zoomPopup(popup, place);
                    } else {
                        Popups.restorePopup(popup);
                    }
                };

                button.updateState = () => {
                    let popup = Popups.containingPopFrame(button);

                    let alternateStateEnabled = Popups.popupIsZoomedToPlace(popup, place);

                    button.innerHTML = alternateStateEnabled ? button.alternateHTML : button.defaultHTML;
                    button.title = alternateStateEnabled ? button.alternateTitle : button.defaultTitle;

                    button.swapClasses([ `zoom-${place}`, "restore" ], (alternateStateEnabled ? 1 : 0));
                };

                return button;
            });
        },

        //  Pin button.
        pinButton: () => {
            let button = Popups.titleBarComponents.genericButton();
            button.classList.add("pin-button", "pin");

            button.defaultHTML = Popups.titleBarComponents.getButtonIcon("pin");
            button.alternateHTML = Popups.titleBarComponents.getButtonIcon("unpin");
            button.innerHTML = button.defaultHTML;

            button.defaultTitle = Popups.titleBarComponents.buttonTitles["pin"];
            button.alternateTitle = Popups.titleBarComponents.buttonTitles["unpin"];
            button.title = button.defaultTitle;

            button.buttonAction = (event) => {
                event.stopPropagation();

                let popup = Popups.containingPopFrame(button);

                if (event.altKey == true) {
                    let action = Popups.popupIsPinned(popup) ? "unpinPopup" : "pinPopup";
                    Popups.allUnminimizedPopups().forEach(Popups[action]);
                } else {
                    Popups.pinOrUnpinPopup(popup);
                }
            };

            button.updateState = () => {
                let popup = Popups.containingPopFrame(button);

                button.innerHTML = Popups.popupIsPinned(popup) ? button.alternateHTML : button.defaultHTML;
                button.title = Popups.popupIsPinned(popup) ? button.alternateTitle : button.defaultTitle;

                button.swapClasses([ "pin", "unpin" ], (Popups.popupIsPinned(popup) ? 1 : 0));

				button.disabled = (Popups.popupIsMinimized(popup));
            };

            return button;
        },

		//	Minimize button.
		minimizeButton: () => {
            let button = Popups.titleBarComponents.genericButton();
            button.classList.add("minimize-button", "pin");

            button.defaultHTML = Popups.titleBarComponents.getButtonIcon("minimize");
            button.alternateHTML = Popups.titleBarComponents.getButtonIcon("unminimize");
            button.innerHTML = button.defaultHTML;

            button.defaultTitle = Popups.titleBarComponents.buttonTitles["minimize"];
            button.alternateTitle = Popups.titleBarComponents.buttonTitles["unminimize"];
            button.title = button.defaultTitle;

            button.buttonAction = (event) => {
                event.stopPropagation();

                let popup = Popups.containingPopFrame(button);

                if (event.altKey == true) {
                    let action = Popups.popupIsMinimized(popup) ? "minimizePopup" : "pinPopup";
                    Popups.allSpawnedPopups().forEach(Popups[action]);
                } else {
                    Popups.minimizeOrUnminimizePopup(popup);
                }
            };

            button.updateState = () => {
                let popup = Popups.containingPopFrame(button);

                button.innerHTML = Popups.popupIsMinimized(popup) ? button.alternateHTML : button.defaultHTML;
                button.title = Popups.popupIsMinimized(popup) ? button.alternateTitle : button.defaultTitle;

                button.swapClasses([ "minimize", "unminimize" ], (Popups.popupIsMinimized(popup) ? 1 : 0));
            };

            return button;
		},

        //  Options button (does nothing by default).
        optionsButton: () => {
            let button = Popups.titleBarComponents.genericButton();
            button.classList.add("options-button");

            button.innerHTML = Popups.titleBarComponents.getButtonIcon("options");
            button.title = Popups.titleBarComponents.buttonTitles["options"];

            return button;
        },

        /*  Add a submenu of the given class and with given buttons to a button.
         */
        addSubmenuToButton: (button, submenuClass, submenuButtons) => {
            let popup = Popups.containingPopFrame(button);

            button.classList.add("has-submenu");

            button.submenu = newElement("DIV", { class: `submenu ${submenuClass}` });

            popup.titleBar.insertBefore(button.submenu, button.nextElementSibling);

            submenuButtons.forEach(submenuButton => {
                button.submenu.appendChild(submenuButton);
                if (submenuButton.buttonAction)
                    submenuButton.addActivateEvent(submenuButton.buttonAction);
            });
        },
    },

    /******************/
    /*  Optional parts.
     */

    addPartToPopFrame: (popup, part) => {
        popup.append(part);
    },

    /*********************/
    /*  Popups z-ordering.
     */

    updatePopupsZOrder: () => {
        GWLog("Popups.updatePopupsZOrder", "popups.js", 3);

		let focusedPopup = Popups.focusedPopup();

		let zIndex = 0;
		Popups.allSpawnedPopups().filter(x => (x != focusedPopup)).forEach(popup => { popup.style.zIndex = ++zIndex; });

		if (focusedPopup != null)
			focusedPopup.style.zIndex = ++zIndex;
    },

    frontmostPopup: (options) => {
		options = Object.assign({
			includeMinimizedPopups: false,
			preferUnminimizedPopups: true
		}, options);

		return (options.includeMinimizedPopups
				? (options.preferUnminimizedPopups
				   ? (Popups.allUnminimizedPopups().last ?? Popups.allMinimizedPopups().last)
				   : Popups.allSpawnedPopups().last)
				: Popups.allUnminimizedPopups().last);
    },

    bringPopupToFront: (popup) => {
        GWLog("Popups.bringPopupToFront", "popups.js", 3);

		//	Focus popup.
		Popups.focusPopup(popup);

		//  Update z-indexes of all popups.
		Popups.updatePopupsZOrder();
    },

	backmostPopup: (options) => {
		options = Object.assign({
			includeMinimizedPopups: false
		}, options);

		return (options.includeMinimizedPopups
				? Popups.allSpawnedPopups().first
				: Popups.allUnminimizedPopups().first);
	},

	sendPopupToBack: (popup, options) => {
        GWLog("Popups.sendPopupToBack", "popups.js", 3);

		options = Object.assign({
			includeMinimizedPopups: false
		}, options);

        //  Set z-index.
        popup.style.zIndex = "0";

        //  Focus the front-most popup.
        Popups.focusPopup(Popups.frontmostPopup({
        	includeMinimizedPopups: options.includeMinimizedPopups,
        	preferUnminimizedPopups: false,
        }));

        //  Update z-indexes of all popups.
        Popups.updatePopupsZOrder();
	},

    /******************/
    /*  Popup focusing.
     */

    popupIsFocused: (popup) => {
        return popup.classList.contains("focused");
    },

    focusedPopup: () => {
        return Popups.allSpawnedPopups().find(popup => Popups.popupIsFocused(popup));
    },

    focusPopup: (popup) => {
        GWLog("Popups.focusPopup", "popups.js", 3);

        //  Un-focus any focused popups.
        Popups.allSpawnedPopups().forEach(Popups.unfocusPopup);

        //  Focus the given popup.
        if (popup)
            Popups.addClassesToPopFrame(popup, "focused");
    },

	unfocusPopup: (popup) => {
		Popups.removeClassesFromPopFrame(popup, "focused");
	},

    /*********************/
    /*  Popup positioning.
     */

    /*  Returns full viewport rect for popup and all auxiliary elements
        (footers, etc.).
     */
    getPopupViewportRect: (popup) => {
        return rectUnion(popup.getBoundingClientRect(), ...(Array.from(popup.children).map(child => {
            let rect = child.getBoundingClientRect();
            return (rect.width * rect.height == 0
                    ? null
                    : rect);
        }).filter(x => x)));
    },

    //  See also: extracts.js
    preferPopupSidePositioning: (target) => {
        return (target.preferPopupSidePositioning?.() ?? false);
    },

    //  See also: misc.js
    cancelPopupOnClick: (target) => {
        return (target.cancelPopupOnClick?.() ?? true);
    },

	//	See also: misc.js
	keepPopupAttachedOnPin: (target) => {
		return (target.keepPopupAttachedOnPin?.() ?? false);
	},

	savePopupPosition: (popup) => {
		if (   Popups.popupWasResized(popup) == false
			&& Popups.popupIsZoomed(popup) == false) {
			popup.dataset.originalXPosition = popup.viewportRect.left;
			popup.dataset.originalYPosition = popup.viewportRect.top;
		}

		popup.dataset.previousXPosition = popup.viewportRect.left;
		popup.dataset.previousYPosition = popup.viewportRect.top;
	},

	getSavedPopupPosition: (popup, options)	=> {
		options = Object.assign({
			original: false
		}, options);

		let getPosition = (prefix) => {
			if (   popup.dataset[prefix + "XPosition"] == null
				|| popup.dataset[prefix + "YPosition"] == null)
				return null;

			return {
				x: parseFloat(popup.dataset[prefix + "XPosition"]),
				y: parseFloat(popup.dataset[prefix + "YPosition"])
			};
		};

		return (options.original
				? getPosition("original")
				: getPosition("previous"));
	},

    positionPopup: (popup, options) => {
        GWLog("Popups.positionPopup", "popups.js", 2);

        options = Object.assign({
            spawnPoint: null,
            tight: false,
            reset: false
        }, options);

        if (popup == Popups.popupBeingResized)
            return;

        let target = popup.spawningTarget;

        let spawnPoint = options.spawnPoint ?? target.lastMouseEnterLocation;
        if (spawnPoint)
            target.lastMouseEnterLocation = spawnPoint;
        else
            return;

        /*  When the target’s bounding rect is composed of multiple client rects
            (as when the target is a link that wraps across a line break), we
            must select the right rect, to prevent the popup from spawning far
            away from the cursor. (We expand client rects by 0.5 when we do hit
            testing, to compensate for rounding bugs in pointer location.)
         */
        let targetViewportRect =    Array.from(target.getClientRects()).map(rect =>
                                        new DOMRect(rect.x - 0.5,
                                                    rect.y - 0.5,
                                                    rect.width  + 1.0,
                                                    rect.height + 1.0)
                                    ).find(rect => pointWithinRect(spawnPoint, rect))
                                 ?? target.getBoundingClientRect();

		if (   options.reset
			&& Popups.popupIsPinned(popup) == false)
			Popups.clearPopupViewportRect(popup);

		let provisionalPopupXPosition = 0.0;
		let provisionalPopupYPosition = 0.0;

		//  Special cases.
		if (Popups.popFrameHasClass(popup, "restored")) {
			let savedPosition = Popups.getSavedPopupPosition(popup, { original: true });
			provisionalPopupXPosition = savedPosition.x;
			provisionalPopupYPosition = savedPosition.y;

			Popups.removeClassesFromPopFrame(popup, "restored");
		} else if (Popups.popFrameHasClass(popup, "unminimized")) {
			let savedPosition = Popups.getSavedPopupPosition(popup);
			provisionalPopupXPosition = savedPosition.x;
			provisionalPopupYPosition = savedPosition.y;

			Popups.removeClassesFromPopFrame(popup, "unminimized");
		} else if (Popups.popFrameHasClass(popup, "unpinned")) {
			provisionalPopupXPosition = popup.viewportRect.left;
			provisionalPopupYPosition = popup.viewportRect.top;

			Popups.removeClassesFromPopFrame(popup, "unpinned");
		} else if (Popups.popupIsZoomed(popup)) {
			provisionalPopupXPosition = popup.zoomToX;
			provisionalPopupYPosition = popup.zoomToY;
		} else if (Popups.popupIsPinned(popup)) {
			provisionalPopupXPosition = popup.viewportRect.left;
			provisionalPopupYPosition = popup.viewportRect.top;
		} else {
			//  Base case.

			/*  This is the width and height of the popup, as already
				determined by the layout system, and taking into account the
				popup’s content, and the max-width, min-width, etc., CSS
				properties.
			 */
			let popupIntrinsicRect = Popups.getPopupViewportRect(popup);

			/*  If the popup is a nested popup, or the target specifies that
				it prefers to have popups spawned to the side, we try to put
				the popup off to the left or right. Otherwise, it’ll be
				above or below.
			 */
			let offToTheSide = (   Popups.containingPopFrame(target)
								|| Popups.preferPopupSidePositioning(target))
							   ? true
							   : false;

			if (offToTheSide == true) {
				//  Determine whether to put the popup off to the right, or left.
				if (  targetViewportRect.right
					+ Popups.popupBreathingRoomX
					+ popupIntrinsicRect.width
					  <= document.documentElement.offsetWidth) {
					//  Off to the right.
					provisionalPopupXPosition = targetViewportRect.right + Popups.popupBreathingRoomX;
				} else if (  targetViewportRect.left
						   - Popups.popupBreathingRoomX
						   - popupIntrinsicRect.width
							 >= 0) {
					//  Off to the left.
					provisionalPopupXPosition = targetViewportRect.left - popupIntrinsicRect.width - Popups.popupBreathingRoomX;
				} else {
					//  Not off to either side, in fact.
					offToTheSide = false;
				}
			}

			/*  Can the popup fit above the target? If so, put it there.
				Failing that, can it fit below the target? If so, put it there.
			 */
			if (offToTheSide == false) {
				let popupBreathingRoomY = (options.tight
										   ? Popups.popupBreathingRoomYTight
										   : Popups.popupBreathingRoomY)
				let popupSpawnYOriginForSpawnAbove = targetViewportRect.top
												   - popupBreathingRoomY;
				let popupSpawnYOriginForSpawnBelow = targetViewportRect.bottom
												   + popupBreathingRoomY;

				if (  popupSpawnYOriginForSpawnAbove
					- popupIntrinsicRect.height
					  >= 0) {
					//  Above.
					provisionalPopupYPosition = popupSpawnYOriginForSpawnAbove - popupIntrinsicRect.height;
				} else if (  popupSpawnYOriginForSpawnBelow
						   + popupIntrinsicRect.height
							 <= window.innerHeight) {
					//  Below.
					provisionalPopupYPosition = popupSpawnYOriginForSpawnBelow;
				} else {
					//  The popup does not fit above or below!
					if (options.tight != true) {
						//  Let’s try and pack it in more tightly...
						Popups.positionPopup(popup, { tight: true });
						return;
					} else {
						/*  ... or, failing that, we will have to put it off to
							the right after all.
						 */
						offToTheSide = true;
					}
				}
			}

			if (offToTheSide == false) {
				//  Place popup above the target, slightly to the right.
				provisionalPopupXPosition = spawnPoint.x + Popups.popupBreathingRoomX;
			} else {
				//  Place popup fully to the right or left.
				if (  targetViewportRect.left
					- Popups.popupBreathingRoomX
					- popupIntrinsicRect.width
					>= 0) {
					//  Off to the left.
					provisionalPopupXPosition = targetViewportRect.left - popupIntrinsicRect.width - Popups.popupBreathingRoomX;
				} else {
					//  Off to the right.
					provisionalPopupXPosition = targetViewportRect.right + Popups.popupBreathingRoomX;
				}
			}

			if (offToTheSide == true) {
				/*  If popup is to the side, position it vertically so that
					its middle is about level with the target. (Make sure
					the popup’s top edge is not above the viewport.)
				 */
				provisionalPopupYPosition = spawnPoint.y - ((spawnPoint.y / window.innerHeight) * popupIntrinsicRect.height);
				if (provisionalPopupYPosition < 0.0)
					provisionalPopupYPosition = 0.0;
			}

			/*  Does the popup extend past the right edge of the container?
				If so, move it left, until its right edge is flush with
				the container’s right edge.
			 */
			if (  provisionalPopupXPosition
				+ popupIntrinsicRect.width
				  > document.documentElement.offsetWidth) {
				//  We add 1.0 here to prevent wrapping due to rounding.
				provisionalPopupXPosition -= (  provisionalPopupXPosition
											  + popupIntrinsicRect.width
											  - document.documentElement.offsetWidth
											  + 1.0);
			}

			/*  Now (after having nudged the popup left, if need be),
				does the popup extend past the *left* edge of the container?
				Make its left edge flush with the container's left edge.
			 */
			if (provisionalPopupXPosition < 0)
				provisionalPopupXPosition = 0;
		}

		//  Set only position, not size.
		Popups.setPopupViewportRect(popup, new DOMRect(provisionalPopupXPosition, provisionalPopupYPosition, 0, 0));

		//  Cache the viewport rect.
		popup.viewportRect = popup.getBoundingClientRect();
    },

    clearPopupViewportRect: (popup) => {
        GWLog("Popups.clearPopupViewportRect", "popups.js", 3);

        popup.style.left = "";
        popup.style.top = "";
    },

    setPopupViewportRect: (popup, rect, options) => {
        GWLog("Popups.setPopupViewportRect", "popups.js", 3);

        options = Object.assign({
            clampPositionToScreen: false
        }, options);

        if (options.clampPositionToScreen) {
            //  Viewport width must account for vertical scroll bar.
            let viewportWidth = document.documentElement.offsetWidth;
            let viewportHeight = window.innerHeight;

            //  Clamp position to screen, keeping size constant.
            rect.x = valMinMax(rect.x,
                               0,
                               viewportWidth - (rect.width || popup.viewportRect.width));
            rect.y = valMinMax(rect.y,
                               0,
                               viewportHeight - (rect.height || popup.viewportRect.height));
        }

        if (Popups.popupIsPinned(popup) == false) {
            let popupContainerViewportRect = Popups.popupContainer.getBoundingClientRect();
            rect.x -= popupContainerViewportRect.left;
            rect.y -= popupContainerViewportRect.top;
        }

        popup.style.position = Popups.popupIsPinned(popup) ? "fixed" : "";

        popup.style.left = `${(Math.round(rect.x))}px`;
        popup.style.top = `${(Math.round(rect.y))}px`;

        if (   rect.width > 0
            && rect.height > 0) {
            popup.style.maxWidth = "unset";
            popup.style.maxHeight = "unset";

            popup.style.width = `${(Math.round(rect.width))}px`;
            popup.style.height = `${(Math.round(rect.height))}px`;
        }

        requestAnimationFrame(() => {
            //  Set scroll view height.
            popup.body.style.setProperty("--popframe-scroll-view-height", popup.scrollView.clientHeight + "px");
        });
    },

    /****************/
    /*  Popup timers.
     */

    clearPopupTimers: (target) => {
        GWLog("Popups.clearPopupTimers", "popups.js", 3);

        if (target.popup)
            Popups.removeClassesFromPopFrame(target.popup, "fading");

        clearTimeout(target.popupFadeTimer);
        clearTimeout(target.popupDespawnTimer);
        clearTimeout(target.popupSpawnTimer);
    },

    setPopupSpawnTimer: (target, event) => {
        GWLog("Popups.setPopupSpawnTimer", "popups.js", 2);

        let popupTriggerDelay = target.specialPopupTriggerDelay != null
                                ? (typeof target.specialPopupTriggerDelay == "function"
                                   ? target.specialPopupTriggerDelay()
                                   : target.specialPopupTriggerDelay)
                                : Popups.popupTriggerDelay;
        target.popupSpawnTimer = setTimeout(() => {
            GWLog("Popups.popupSpawnTimer fired", "popups.js", 2);

            //  Spawn the popup.
            Popups.spawnPopup(target, { x: event.clientX, y: event.clientY });
        }, popupTriggerDelay);
    },

    setPopupFadeTimer: (target) => {
        GWLog("Popups.setPopupFadeTimer", "popups.js", 2);

        target.popupFadeTimer = setTimeout(() => {
            GWLog("popupFadeTimer fired", "popups.js", 2);

            Popups.setPopupDespawnTimer(target);
        }, Popups.popupFadeoutDelay);
    },

    setPopupDespawnTimer: (target) => {
        GWLog("Popups.setPopupDespawnTimer", "popups.js", 2);

        Popups.addClassesToPopFrame(target.popup, "fading");
        target.popupDespawnTimer = setTimeout(() => {
            GWLog("popupDespawnTimer fired", "popups.js", 2);

            Popups.despawnPopup(target.popup);
        }, Popups.popupFadeoutDuration);
    },

    /********************************/
    /*  Popup progress UI indicators.
     */

    setWaitCursorForTarget: (target) => {
        GWLog("Popups.setWaitCursorForTarget", "popups.js", 2);

        document.documentElement.style.cursor = "progress";
        target.style.cursor = "progress";
        if (target.popup)
            target.popup.style.cursor = "progress";
    },

    clearWaitCursorForTarget: (target) => {
        GWLog("Popups.clearWaitCursorForTarget", "popups.js", 3);

        document.documentElement.style.cursor = "";
        target.style.cursor = "";
        if (target.popup)
            target.popup.style.cursor = "";
    },

    /*******************/
    /*  Event listeners.
     */

   /*   The “user moved mouse out of popup” mouseleave event.
    */
    //  Added by: Popups.injectPopup
    popupMouseLeave: (event) => {
        GWLog("Popups.popupMouseLeave", "popups.js", 2);

        if (Popups.popupBeingDragged)
            return;

        if (Popups.popupContainerIsVisible() == false)
            return;

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

		if (Popups.popupIsMinimized(popup)) {
			Popups.unfocusPopup(popup);

			//	Focus the front-most un-minimized popup.
	        Popups.focusPopup(Popups.frontmostPopup({ includeMinimizedPopups: true }));
		} else {
			Popups.getPopupAncestorStack(popup).reverse().forEach(popupInStack => {
				Popups.clearPopupTimers(popupInStack.spawningTarget);
				Popups.setPopupFadeTimer(popupInStack.spawningTarget);
			});
		}
    },

    /*  The “user moved mouse back into popup” mouseenter event.
     */
    //  Added by: Popups.injectPopup
    popupMouseEnter: (event) => {
        GWLog("Popups.popupMouseEnter", "popups.js", 2);

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

		if (Popups.popupIsMinimized(popup)) {
			Popups.focusPopup(popup);
		} else {
			Popups.getPopupAncestorStack(popup).forEach(popupInStack => {
				Popups.clearPopupTimers(popupInStack.spawningTarget);
			});
		}
    },

    /*  The “user clicked in body of popup” event.
     */
    //  Added by: Popups.injectPopup
    popupClicked: (event) => {
        GWLog("Popups.popupClicked", "popups.js", 2);

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

		//	If popup is minimized, do nothing.
		if (Popups.popupIsMinimized(popup))
			return;

        //  Prevent other events from triggering.
        event.stopPropagation();

		//	Bring popup to front (unless clicking with meta key).
		if (event.metaKey == false)
            Popups.bringPopupToFront(popup);

        Popups.clearPopupTimers(popup.spawningTarget);
    },

    /*  The popup mouse down event (for resizing by dragging an edge/corner).
     */
    //  Added by: Popups.injectPopup
    popupMouseDown: (event) => {
        GWLog("Popups.popupMouseDown", "popups.js", 2);

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

        /*  Make sure that this is a left-click; that we’re clicking on the 
        	popup (i.e. its edge) and not on any of the popup’s contained 
        	elements; and that the popup is resizeable (i.e., that it is pinned 
        	or zoomed, and not minimized).
         */
        if (   event.button != 0
            || event.target != popup
            || Popups.popupIsResizeable(popup) == false)
            return;

        //  Prevent other events from triggering.
        event.stopPropagation();

        //  Bring the popup to the front, if need be.
        if (event.metaKey == false)
            Popups.bringPopupToFront(popup);

        //  Prevent clicks from doing anything other than what we want.
        event.preventDefault();

        //  Mark popup as being resized.
        Popups.addClassesToPopFrame(popup, "resizing");

        //  Determine direction of resizing.
        let edgeOrCorner = Popups.edgeOrCorner(popup, {
            x: event.clientX - popup.viewportRect.left,
            y: event.clientY - popup.viewportRect.top
        });

        //  Perhaps we cannot resize in this direction?
        if (edgeOrCorner == "")
            return;

		//	Save resize direction.
		popup.edgeOrCorner = edgeOrCorner;

        /*  Deal with edge case where resize against screen edge ends up
            with the mouse-up event happening in the popup body.
         */
        popup.removeEventListener("click", Popups.popupClicked);

        //  Save position.
		Popups.savePopupPosition(popup);

        //  Popup minimum width/height.
        popup.popupMinWidth = parseFloat(getComputedStyle(popup).minWidth);
        popup.popupMinHeight = parseFloat(getComputedStyle(popup).minHeight);

        //  Point where the drag began.
        popup.dragStartMouseCoordX = event.clientX;
        popup.dragStartMouseCoordY = event.clientY;

		//	Store reference to popup, for mouse event listeners.
		Popups.popupBeingResized = popup;

        //  The mousemove event that triggers the continuous resizing.
        addMousemoveListener(Popups.popupResizeMouseMove, { name: "popupResizeMousemoveListener" });

        /*  Add the resize-end mouseup event listener (to window, not the popup,
        	because the drag might end anywhere, due to animation lag).
         */
        window.addEventListener("mouseup", Popups.popupResizeMouseUp, { once: true });
    },

	popupResizeMouseMove: (event) => {
        GWLog("Popups.popupResizeMouseMove", "popups.js", 3);

		let popup = Popups.popupBeingResized;

		//	Update classes.
		Popups.removeClassesFromPopFrame(popup, ...(Popups.titleBarComponents.popupPlaces));
		Popups.addClassesToPopFrame(popup, "resized");

		//  Viewport width must account for vertical scroll bar.
		let viewportWidth = document.documentElement.offsetWidth;
		let viewportHeight = window.innerHeight;

		let deltaX = event.clientX - popup.dragStartMouseCoordX;
		let deltaY = event.clientY - popup.dragStartMouseCoordY;

		let newPopupViewportRect = DOMRect.fromRect(popup.viewportRect);

		let resizeTop = () => {
			newPopupViewportRect.y = valMinMax(popup.viewportRect.y + deltaY, 0, popup.viewportRect.bottom - popup.popupMinHeight);
			newPopupViewportRect.height = popup.viewportRect.bottom - newPopupViewportRect.y;
		};
		let resizeBottom = () => {
			newPopupViewportRect.height = valMinMax(popup.viewportRect.height + deltaY, popup.popupMinHeight, viewportHeight - popup.viewportRect.y);
		};
		let resizeLeft = () => {
			newPopupViewportRect.x = valMinMax(popup.viewportRect.x + deltaX, 0, popup.viewportRect.right - popup.popupMinWidth);
			newPopupViewportRect.width = popup.viewportRect.right - newPopupViewportRect.x;
		};
		let resizeRight = () => {
			newPopupViewportRect.width = valMinMax(popup.viewportRect.width + deltaX, popup.popupMinWidth, viewportWidth - popup.viewportRect.x);
		};

		switch (popup.edgeOrCorner) {
			case "edge-top":
				resizeTop();
				break;
			case "edge-bottom":
				resizeBottom();
				break;
			case "edge-left":
				resizeLeft();
				break;
			case "edge-right":
				resizeRight();
				break;
			case "corner-top-left":
				resizeTop();
				resizeLeft();
				break;
			case "corner-bottom-right":
				resizeBottom();
				resizeRight();
				break;
			case "corner-top-right":
				resizeTop();
				resizeRight();
				break;
			case "corner-bottom-left":
				resizeBottom();
				resizeLeft();
				break;
		}

		Popups.setPopupViewportRect(popup, newPopupViewportRect);
	},

    /*  The resize-end mouseup event.
     */
    //  Added by: Popups.popupMouseDown
    popupResizeMouseUp: (event) => {
        GWLog("Popups.popupResizeMouseUp", "popups.js", 2);

        //  Prevent other events from triggering.
        event.stopPropagation();

        //  Remove the mousemove handler.
        removeMousemoveListener("popupResizeMousemoveListener");

        //  Reset cursor to normal.
        document.documentElement.style.cursor = "";

        let popup = Popups.popupBeingResized;
        if (popup) {
            Popups.removeClassesFromPopFrame(popup, "resizing");

            if (Popups.popupWasResized(popup))
                popup.titleBar.updateState();

			//	Delete saved resize direction.
			popup.edgeOrCorner = null;

			//	Delete saved minimum dimensions.
			popup.popupMinWidth = null;
			popup.popupMinHeight = null;

			//	Delete saved drag-start coordinates.
			popup.dragStartMouseCoordX = null;
			popup.dragStartMouseCoordY = null;

            //  Cache the viewport rect.
            popup.viewportRect = popup.getBoundingClientRect();

            //  Ensure that the click listener isn’t fired at once.
            requestAnimationFrame(() => {
                popup.addEventListener("click", Popups.popupClicked);
            });
        }

        Popups.popupBeingResized = null;
    },

    /*  The popup mouseout event.
     */
    //  Added by: Popups.injectPopup
    popupMouseOut: (event) => {
        GWLog("Popups.popupMouseOut", "popups.js", 3);

        //  Reset cursor.
        if (   Popups.popupBeingDragged == null
        	&& Popups.popupBeingResized == null
            && event.target.style.cursor == "")
            document.documentElement.style.cursor = "";
    },

    /*  The popup title bar mousedown event.
     */
    //  Added by: Popups.addTitleBarToPopup
    popupTitleBarMouseDown: (event) => {
        GWLog("Popups.popupTitleBarMouseDown", "popups.js", 2);

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

		/*	Make sure that this is a left-click; that we’re clicking on an 
			empty part of the title bar or else on the title itself (but not on
			a title bar button); and the the popup is draggable (i.e., that it 
			is not minimized).
		 */
		if (   event.button != 0
			|| Popups.popupIsMinimized(popup)
			|| event.target.closest(".popframe-title-bar-button"))
			return;

        //  Prevent other events from triggering.
        event.stopPropagation();

        //  Bring the popup to the front, if need be.
        if (event.metaKey == false)
            Popups.bringPopupToFront(popup);

        //  Prevent clicks from doing anything other than what we want.
        event.preventDefault();

        //  Mark popup as grabbed.
        Popups.addClassesToPopFrame(popup, "grabbed");

        //  Change cursor to “grabbing hand”.
        document.documentElement.style.cursor = "grabbing";

       /*  If the mouse-down event is on the popup title (and the title
            is a link).
         */
        popup.linkDragTarget = event.target.closest("a");

        /*  Deal with edge case where drag to screen bottom ends up
            with the mouse-up event happening in the popup body.
         */
        popup.removeEventListener("click", Popups.popupClicked);

        //  Point where the drag began.
        popup.dragStartMouseCoordX = event.clientX;
        popup.dragStartMouseCoordY = event.clientY;

		//	Store reference to popup, for mouse event listeners.
		Popups.popupBeingDragged = popup;

		//	Add the drag mousemove listener.
		addMousemoveListener(Popups.popupDragMouseMove, { name: "popupDragMousemoveListener" });

        //  Add the drag-end mouseup listener.
        window.addEventListener("mouseup", Popups.popupDragMouseUp, { once: true });
    },

	/*	The mousemove event fired during popup drag-to-move.
	 */
	//	Added by: Popups.popupTitleBarMouseDown
	popupDragMouseMove: (event) => {
        GWLog("Popups.popupDragMouseMove", "popups.js", 3);

		let popup = Popups.popupBeingDragged;

		//	Pin the popup.
		Popups.pinPopup(popup);

		//  Update classes.
		Popups.addClassesToPopFrame(popup, "dragging");

		//  If dragging by the title, disable its normal click handler.
		if (popup.linkDragTarget)
			popup.linkDragTarget.onclick = (event) => { return false; };

		//  Set new viewport rect; clamp to screen.
		Popups.setPopupViewportRect(popup, 
									new DOMRect(popup.viewportRect.x + (event.clientX - popup.dragStartMouseCoordX),
												popup.viewportRect.y + (event.clientY - popup.dragStartMouseCoordY),
												0, 0), 
									{ clampPositionToScreen: true });
	},

    /*  The mouseup event that ends a popup drag-to-move.
     */
    //  Added by: Popups.popupTitleBarMouseDown
    popupDragMouseUp: (event) => {
        GWLog("Popups.popupDragMouseUp", "popups.js", 2);

        //  Prevent other events from triggering.
        event.stopPropagation();

        //  Remove the mousemove handler.
        removeMousemoveListener("popupDragMousemoveListener");

        //  Reset cursor to normal.
        document.documentElement.style.cursor = "";

        let popup = Popups.popupBeingDragged;
        if (popup) {
            Popups.removeClassesFromPopFrame(popup, "grabbed", "dragging");

            //  Re-enable clicking on the title.
            if (popup.linkDragTarget) {
                requestAnimationFrame(() => {
                    popup.linkDragTarget.onclick = null;
                    popup.linkDragTarget = null;
                });
            }

			//	Delete saved drag-start coordinates.
			popup.dragStartMouseCoordX = null;
			popup.dragStartMouseCoordY = null;

            //  Cache the viewport rect.
            popup.viewportRect = popup.getBoundingClientRect();

            //  Ensure that the click listener isn’t fired at once.
            requestAnimationFrame(() => {
                popup.addEventListener("click", Popups.popupClicked);
            });
        }

        Popups.popupBeingDragged = null;
    },

    /*  The popup title bar mouseup event.
     */
    //  Added by: Popups.addTitleBarToPopup
    popupTitleBarMouseUp: (event) => {
        GWLog("Popups.popupTitleBarMouseUp", "popups.js", 2);

        //  Get the containing popup.
        let popup = Popups.containingPopFrame(event.target);

        Popups.containingPopFrame(popup).classList.toggle("grabbed", false);
    },

	/*	The popup title bar click event.
	 */
	//	Added by: Popups.addTitleBarToPopup
	popupTitleBarClicked: (event) => {
        GWLog("Popups.popupTitleBarClicked", "popups.js", 2);

        //  Prevent other events from triggering.
        event.stopPropagation();

        let popup = Popups.containingPopFrame(event.target);
	
		if (Popups.popupIsMinimized(popup)) {
			if (event.altKey == true) {
				Popups.allMinimizedPopups().forEach(Popups.unminimizePopup);
			} else {
				Popups.unminimizePopup(popup);
			}

			//	Bring popup to front (unless clicking with meta key).
			if (event.metaKey == false)
				Popups.bringPopupToFront(popup);
		}
	},

    /*  The popup title bar double-click event.
     */
    //  Added by: Popups.addTitleBarToPopup
    popupTitleBarDoubleClicked: (event) => {
        GWLog("Popups.popupTitleBarDoubleClicked", "popups.js", 2);

        //  Prevent other events from triggering.
        event.stopPropagation();

        let popup = Popups.containingPopFrame(event.target);

		if (Popups.popupIsMinimized(popup)) {
			return;
		} else {
			if (event.altKey == true) {
				let expand = Popups.popupIsCollapsed(Popups.containingPopFrame(event.target));
				Popups.allUnminimizedPopups().forEach(expand ? Popups.uncollapsePopup : Popups.collapsePopup);
			} else {
				Popups.collapseOrUncollapsePopup(popup);
			}
		}
    },

    /*  The target mouseenter event.
     */
    //  Added by: Popups.addTarget
    targetMouseEnter: (event) => {
        GWLog("Popups.targetMouseEnter", "popups.js", 2);

        if (Popups.popupBeingDragged)
            return;

        if (Popups.hoverEventsActive == false)
            return;

        //  Stop the countdown to un-pop the popup.
        Popups.clearPopupTimers(event.target);

        if (event.target.popup == null) {
            //  Start the countdown to pop up the popup (if not already spawned).
            Popups.setPopupSpawnTimer(event.target, event);
        } else {
            /*  If already spawned, just bring the popup to the front and
                re-position it.
             */
            Popups.bringPopupToFront(event.target.popup);
            Popups.positionPopup(event.target.popup, { spawnPoint: { x: event.clientX, y: event.clientY } });
        }
    },

    /*  The target mouseleave event.
     */
    //  Added by: Popups.addTarget
    targetMouseLeave: (event) => {
        GWLog("Popups.targetMouseLeave", "popups.js", 2);

        Popups.clearPopupTimers(event.target);

        if (   event.target.popup != null
        	&& Popups.popupIsPinned(event.target.popup) == false)
            Popups.setPopupFadeTimer(event.target);
    },

    /*  The “user (left- or right-) clicked target” mousedown event.
     */
    //  Added by: Popups.addTarget
    targetMouseDown: (event) => {
        GWLog("Popups.targetMouseDown", "popups.js", 2);

        if (Popups.popupBeingDragged)
            return;

        if (   event.target.closest(".popframe-ui-elements-container")
            && event.button == 0)
            return;

        /*  Unlike ‘mouseenter’ and ‘mouseleave’, ‘mousedown’ behaves like
            ‘mouseover’/‘mouseout’ in that it attaches to the innermost element,
            which might not be our spawning target (but instead some descendant
            element); we must find the actual spawning target.
         */
        let target = event.target.closest(".spawns-popup");

        if (Popups.cancelPopupOnClick(target)) {
            //  Cancel spawning of popups from the target.
            Popups.clearPopupTimers(target);

            //  Despawn any (non-pinned) popup already spawned from the target.
            if (target.popup)
                Popups.despawnPopup(target.popup);
        }
    },

    /*  The keyup event.
     */
    //  Added by: Popups.setup
    keyUp: (event) => {
        GWLog("Popups.keyUp", "popups.js", 3);
        let allowedKeys = [
        	"Escape",
        	"Esc",
        	...(Popups.popupTilingControlKeys.split("")),
        	Popups.popupTilingControlKeys.substr(13,1).toUpperCase(),
        	Popups.popupTilingControlKeys.substr(14,1).toUpperCase()
        ];
        if (allowedKeys.includes(event.key) == false)
            return;

		if (event.ctrlKey || event.metaKey)
			return;

		if (   Popups.popupContainerIsVisible() == false
			|| Popups.allSpawnedPopups().length == 0)
			return;

        event.preventDefault();

        switch(event.key) {
            case Popups.popupTilingControlKeys.substr(13,1): {
            		let unminimizedPopups = Popups.allUnminimizedPopups();
            		if (unminimizedPopups.length == 0)
            			break;

					Popups.pinPopup(Popups.focusedPopup());
					Popups.bringPopupToFront(Popups.backmostPopup());
            	}
            	break;
            case Popups.popupTilingControlKeys.substr(14,1): {
            		let unminimizedPopups = Popups.allUnminimizedPopups();
            		if (unminimizedPopups.length == 0)
            			break;

					Popups.pinPopup(Popups.focusedPopup());
					Popups.sendPopupToBack(Popups.focusedPopup());
            	}
            	break;
            case Popups.popupTilingControlKeys.substr(13,1).toUpperCase(): {
					let allPopups = Popups.allSpawnedPopups();
					let focusedPopup = Popups.focusedPopup();

					if (   focusedPopup != null
						&& Popups.popupIsMinimized(focusedPopup) == false)
						Popups.pinPopup(Popups.focusedPopup());

					Popups.bringPopupToFront(Popups.backmostPopup({ includeMinimizedPopups: true }));
            	}
            	break;
            case Popups.popupTilingControlKeys.substr(14,1).toUpperCase(): {
					let allPopups = Popups.allSpawnedPopups();
					let focusedPopup = Popups.focusedPopup();

					if (   focusedPopup != null
						&& Popups.popupIsMinimized(focusedPopup) == false)
						Popups.pinPopup(Popups.focusedPopup());

					Popups.sendPopupToBack(Popups.frontmostPopup({ includeMinimizedPopups: true }), { includeMinimizedPopups: true });
            	}
            	break;
            default:
                break;
        }

		let focusedPopup = Popups.focusedPopup();
		if (focusedPopup == null)
			return;

        switch(event.key) {
            case Popups.popupTilingControlKeys.substr(12,1):
            	Popups.minimizeOrUnminimizePopup(focusedPopup);
            	if (Popups.popupIsMinimized(focusedPopup) == false)
	            	Popups.bringPopupToFront(focusedPopup);
            	break;
            default:
                break;
        }

		if (Popups.popupIsMinimized(focusedPopup))
			return;

        switch(event.key) {
            case "Escape":
            case "Esc":
            	if (Popups.popupIsPinned(focusedPopup)) {
					Popups.unpinPopup(focusedPopup);
				} else {
					Popups.despawnPopup(focusedPopup);
				}
                break;
            case Popups.popupTilingControlKeys.substr(0,1):
                Popups.zoomPopup(focusedPopup, "left");
                break;
            case Popups.popupTilingControlKeys.substr(1,1):
                Popups.zoomPopup(focusedPopup, "bottom");
                break;
            case Popups.popupTilingControlKeys.substr(2,1):
                Popups.zoomPopup(focusedPopup, "top");
                break;
            case Popups.popupTilingControlKeys.substr(3,1):
                Popups.zoomPopup(focusedPopup, "right");
                break;
            case Popups.popupTilingControlKeys.substr(4,1):
                Popups.zoomPopup(focusedPopup, "top-left");
                break;
            case Popups.popupTilingControlKeys.substr(5,1):
                Popups.zoomPopup(focusedPopup, "top-right");
                break;
            case Popups.popupTilingControlKeys.substr(6,1):
                Popups.zoomPopup(focusedPopup, "bottom-right");
                break;
            case Popups.popupTilingControlKeys.substr(7,1):
                Popups.zoomPopup(focusedPopup, "bottom-left");
                break;
            case Popups.popupTilingControlKeys.substr(8,1):
                Popups.zoomPopup(focusedPopup, "full");
                break;
            case Popups.popupTilingControlKeys.substr(9,1):
            	if (Popups.popupIsZoomed(focusedPopup) || Popups.popupWasResized(focusedPopup))
	                Popups.restorePopup(focusedPopup);
                break;
            case Popups.popupTilingControlKeys.substr(10,1):
				Popups.pinOrUnpinPopup(focusedPopup);
                break;
            case Popups.popupTilingControlKeys.substr(11,1):
                Popups.collapseOrUncollapsePopup(focusedPopup);
                break;
            default:
                break;
        }
    }
};

GW.notificationCenter.fireEvent("Popups.didLoad");
/*	Popup/floating footnotes to avoid readers needing to scroll to the end of
	the page to see any footnotes; see
	https://ignorethecode.net/blog/2010/04/20/footnotes/ for details.

	Original author:  Lukas Mathis (2010-04-20)
	License: public domain (“And some people have asked me about a license for 
	this piece of code. I think it’s far too short to get its own license, so 
	I’m relinquishing any copyright claims. Consider the code to be public 
	domain. No attribution is necessary.")
 */

Popins = {
	/*****************/
	/*	Configuration.
		*/

	windowTopPopinPositionMargin: 0.0,
	windowBottomPopinPositionMargin: 0.0,

	/******************/
	/*	Implementation.
		*/

	//	Used in: Popins.containingDocumentForTarget
	rootDocument: document,

	spawnedPopins: [ ],

	//	Called by: Popins.setup
	cleanup: () => {
		GWLog("Popins.cleanup", "popins.js", 1);

		//  Remove all remnant popins.
		Popins.removeAllPopins();

		//  Remove Escape key event listener.
		document.removeEventListener("keyup", Popins.keyUp);

		//	Fire event.
		GW.notificationCenter.fireEvent("Popins.cleanupDidComplete");
	},

	//	Called by: popins.js (doWhenPageLoaded)
	setup: () => {
		GWLog("Popins.setup", "popins.js", 1);

        //  Run cleanup.
        Popins.cleanup();

		//  Add Escape key event listener.
		document.addEventListener("keyup", Popins.keyUp);

		//	Fire event.
		GW.notificationCenter.fireEvent("Popins.setupDidComplete");
	},

	//	Called by: extracts.js
	addTarget: (target, prepareFunction) => {
		//  Bind activate event.
		target.onclick = Popins.targetClicked;

		//  Set prepare function.
		target.preparePopin = prepareFunction;

		//  Mark target as spawning a popin.
		target.classList.toggle("spawns-popin", true);
	},

	//	Called by: extracts.js
	removeTarget: (target) => {
		//  Remove the popin (if any).
		if (target.popin)
			Popins.removePopin(target.popin);

		//  Unbind existing activate events, if any.
		target.onclick = null;

		//  Unset popin prepare function.
		target.preparePopin = null;

		//  Un-mark target as spawning a popin.
		target.classList.toggle("spawns-popin", false);
	},

	/***********/
	/*	Helpers.
		*/

	//	Called by: extracts.js
	scrollElementIntoViewInPopFrame: (element, alwaysRevealTopEdge = false) => {
		let popin = Popins.containingPopFrame(element);

		let elementRect = element.getBoundingClientRect();
		let popinBodyRect = popin.body.getBoundingClientRect();
		let popinScrollViewRect = popin.scrollView.getBoundingClientRect();

		let bottomBound = alwaysRevealTopEdge ? elementRect.top : elementRect.bottom;
		if (   popin.scrollView.scrollTop                              >= elementRect.top    - popinBodyRect.top
			&& popin.scrollView.scrollTop + popinScrollViewRect.height <= bottomBound - popinBodyRect.top)
			return;

		popin.scrollView.scrollTop = elementRect.top - popinBodyRect.top;
	},

	//	Called by: Popins.injectPopinForTarget
	containingDocumentForTarget: (target) => {
		return (Popins.containingPopFrame(target)?.document ?? Popins.rootDocument);
	},

	//	Called by: Popins.keyUp
	getTopPopin: () => {
		return Popins.spawnedPopins.first;
	},

	allSpawnedPopFrames: () => {
		return Popins.allSpawnedPopins();
	},

	//	Called by: Popins.targetClicked (event handler)
	//	Called by: Popins.cleanup
	//	Called by: extracts.js
	allSpawnedPopins: () => {
		return Popins.spawnedPopins;
	},

	//	Called by: Popins.addTitleBarToPopin
	popinStackNumber: (popin) => {
		//  If there’s another popin in the ‘stack’ below this one…
		let popinBelow = (   popin.nextElementSibling
						  && popin.nextElementSibling.classList.contains("popin"))
						 ? popin.nextElementSibling
						 : null;
		if (popinBelow)
			return parseInt(popinBelow.titleBar.stackCounter.textContent) + 1;
		else
			return 1;
	},

	//	Called by: extracts.js
	//	Called by: Popins.containingDocumentForTarget
	//	Called by: Popins.scrollElementIntoViewInPopFrame
	containingPopFrame: (element) => {
		let shadowBody = element.closest(".shadow-body");
		if (shadowBody)
			return shadowBody.popin;

		return element.closest(".popin");
	},

	//	Called by: many functions in many places
	addClassesToPopFrame: (popin, ...args) => {
		popin.classList.add(...args);
		popin.body.classList.add(...args);
	},

	//	Called by: many functions in many places
	removeClassesFromPopFrame: (popin, ...args) => {
		popin.classList.remove(...args);
		popin.body.classList.remove(...args);
	},

	/********************/
	/*	Popin title bars.
		*/

	/*  Add title bar to a popin which has a populated .titleBarContents.
		*/
	//	Called by: Popins.injectPopinForTarget
	addTitleBarToPopin: (popin) => {
		//  Set class ‘has-title-bar’ on the popin.
		popin.classList.add("has-title-bar");

		//  Create and inject the title bar element.
		popin.titleBar = newElement("DIV", { class: "popframe-title-bar" });
		popin.insertBefore(popin.titleBar, popin.firstElementChild);

		//  Add popin stack counter.
		popin.titleBar.stackCounter = newElement("SPAN", { class: "popin-stack-counter" });
		requestAnimationFrame(() => {
			let popinStackNumber = Popins.popinStackNumber(popin);
			popin.titleBar.stackCounter.textContent = popinStackNumber;
			if (popinStackNumber == 1)
				popin.titleBar.stackCounter.style.display = "none";
		});
		popin.titleBar.appendChild(popin.titleBar.stackCounter);

		//  Add the provided title bar contents (buttons, title, etc.).
		popin.titleBarContents.forEach(element => {
			popin.titleBar.appendChild(element);

			if (element.buttonAction)
				element.addActivateEvent(element.buttonAction);
		});

		//	Bind auxiliary title-link click event.
		popin.titleBar.querySelectorAll("a").forEach(link => {
			link.addActivateEvent(Popins.popinTitleBarLinkClicked);
		});
	},

	/*  Add secondary title-link to a popin which has a title-link.
		*/
	//	Called by: Popins.injectPopinForTarget
	addFooterBarToPopin: (popin) => {
		let popinTitleLink = popin.querySelector(".popframe-title-link");
		if (!popinTitleLink)
			return;

		//  Set class ‘has-footer-bar’ on the popin.
		popin.classList.add("has-footer-bar");

		//	Inject popin footer bar.
		popin.footerBar = newElement("DIV", { class: "popin-footer-bar" });
		popin.insertBefore(popin.footerBar, null);

		//	Inject footer title-link.
		popin.footerBar.appendChild(newElement("A", {
			href: popinTitleLink.href,
			class: "popframe-title-link",
			title: `Open ${popinTitleLink.href} in a new tab.`,
			target: "_blank"
		}, {
			innerHTML: `<span class="bracket">[</span>`
					 + `Open in new tab`
					 + `<span class="bracket">]</span>`
		}));
	},

	/*  Elements and methods related to popin title bars.
		*/
	titleBarComponents: {
		//  Icons for various popup title bar buttons.
		buttonIcons: {
			"close": "times-square-light",
			"options": "gear-solid"
		},

		//  Tooltip text for various popup title bar icons.
		buttonTitles: {
			"close": "Close this popin",
			"options": "Show options"
		},

		//  A generic button, with no icon or tooltip text.
		genericButton: () => {
			let button = newElement("BUTTON", { class: "popframe-title-bar-button" });

			button.buttonAction = (event) => { event.stopPropagation(); };

			return button;
		},

		//  Close button.
		closeButton: () => {
			let button = Popins.titleBarComponents.genericButton();

			button.classList.add("close-button");
			button.innerHTML = GW.svg(Popins.titleBarComponents.buttonIcons["close"]);
			button.title = Popins.titleBarComponents.buttonTitles["close"];
			button.buttonAction = (event) => {
				event.stopPropagation();

				Popins.removePopin(Popins.containingPopFrame(event.target));
			};

			return button;
		},

		//  Options button (does nothing by default).
		optionsButton: () => {
			let button = Popins.titleBarComponents.genericButton();

			button.classList.add("options-button");
			button.innerHTML = GW.svg(Popins.titleBarComponents.buttonIcons["options"]);
			button.title = Popins.titleBarComponents.buttonTitles["options"];

			return button;
		}
	},

	/******************/
	/*	Optional parts.
	 */

	addPartToPopFrame: (popin, part) => {
		popin.append(part);
	},

	/******************/
	/*	Popin spawning.
		*/

	//	Called by: Popins.injectPopinForTarget
	newPopin: (target) => {
		GWLog("Popins.newPopin", "popins.js", 2);

		//	Create popin, scroll view, content view, shadow root, shadow body.
		let popin = newElement("DIV", { class: "popin popframe" }, { spawningTarget: target });
		popin.scrollView = popin.appendChild(newElement("DIV", { class: "popframe-scroll-view" }));
		popin.contentView = popin.scrollView.appendChild(newElement("DIV", { class: "popframe-content-view" }));
		popin.document = popin.contentView.attachShadow({ mode: "open" });
		popin.document.body = popin.body = popin.shadowBody = popin.document.appendChild(newElement("DIV", {
			class: "popframe-body popin-body shadow-body"
		}));

		//	Set reverse references.
		popin.document.popin = popin.body.popin = popin.contentView.popin = popin.scrollView.popin = popin;

		//	Inject style reset.
		popin.document.insertBefore(newElement("STYLE", null, { innerHTML: `.shadow-body { all: initial; }` }), popin.body);

		//	Default empty title bar.
		popin.titleBarContents = [ ];

		//	Loading spinner and “loading failed” message views.
		popin.loadingSpinnerView = popin.appendChild(newElement("DIV", { class: "popframe-loading-spinner-view" }));
		popin.loadingFailedMessageView = popin.appendChild(newElement("DIV", { class: "popframe-loading-failed-message-view" }));

		return popin;
	},

	//	Called by: extracts.js
	//	Called by: extracts-content.js
	setPopFrameContent: (popin, content) => {
		if (content) {
			popin.body.replaceChildren(content);

			return true;
		} else {
			return false;
		}
	},

	//	Called by: Popins.targetClicked (event handler)
	injectPopinForTarget: (target, options) => {
		GWLog("Popins.injectPopinForTarget", "popins.js", 2);

		options = Object.assign({
			inheritInitialHeight: true
		}, options);

		//  Create the new popin.
		let popin = Popins.newPopin(target);

		// Prepare the newly created popin for injection.
		if (popin = target.preparePopin(popin)) {
			//	Attach popin to target.
			Popins.attachPopinToTarget(popin, target);
		} else {
			//	Preparation failed.
			return;
		}

		/*  If title bar contents are provided, create and inject the popin
			title bar, and set class `has-title-bar` on the popin.
			*/
		if (popin.titleBarContents.length > 0) {
			Popins.addTitleBarToPopin(popin);

			if (popin.classList.contains("no-footer-bar") == false)
				Popins.addFooterBarToPopin(popin);
		}

		//	Add listener to enable tapping on the backdrop to dismiss the popin.
		popin.addEventListener("click", Popins.popinClicked);

		//  Get containing document (for popins spawned from targets in popins).
		let containingDocument = Popins.containingDocumentForTarget(target);
		if (containingDocument.popin) {
			/*  Save the parent popin’s scroll state when pushing it down the
				‘stack’.
				*/
			containingDocument.popin.lastScrollTop = containingDocument.popin.scrollView.scrollTop;

			/*	If popin is still loading (or has failed to load), and the
				`inheritInitialHeight` option is enabled, then set the new 
				popin’s initial height to the height of the parent popin (to be 
				adjusted after the new popin finishes loading, if ever).
			 */
			if (   options.inheritInitialHeight
				&& (   Popins.popFrameStateLoading(popin)
					|| Popins.popFrameStateLoadingFailed(popin)))
				popin.style.height = Math.round(containingDocument.popin.clientHeight) + "px";

			containingDocument.popin.parentElement.insertBefore(popin, containingDocument.popin);
		} else {
			target.parentElement.insertBefore(popin, target.nextSibling);
		}

		//	Push popin onto spawned popins stack.
		Popins.spawnedPopins.unshift(popin);

		//	Designate ancestors.
		let ancestor = popin.parentElement;
		do { ancestor.classList.add("popin-ancestor"); }
		while (   (ancestor = ancestor.parentElement) 
			   && [ "MAIN", "ARTICLE" ].includes(ancestor.tagName) == false);

		//  Mark target as having an open popin associated with it.
		target.classList.add("popin-open", "highlighted");

		//	Fire event.
		GW.notificationCenter.fireEvent("Popins.popinDidInject", { popin: popin });

		//	Post-inject adjustments.
		requestAnimationFrame(() => {
			if (target.popin == null)
				return;

			//	Adjust popin position.
			if (target.adjustPopinWidth)
				target.adjustPopinWidth(popin);

			//  Scroll page so that entire popin is visible, if need be.
			requestAnimationFrame(() => {
				Popins.scrollPopinIntoView(popin);
			});
		});
	},

	/*	Returns full viewport rect for popin and all auxiliary elements
		(title bar, footers, etc.).
	 */
	getPopinViewportRect: (popin) => {
		return rectUnion(popin.getBoundingClientRect(), ...(Array.from(popin.children).map(x => x.getBoundingClientRect())));
	},

	//	Called by: extracts.js
	popFrameStateLoading: (popin) => {
		return popin.classList.contains("loading");
	},

	//	Called by: extracts.js
	popFrameStateLoadingFailed: (popin) => {
		return popin.classList.contains("loading-failed");
	},

	//	Called by: extracts.js
	setPopFrameStateLoading: (popin) => {
		Popins.removeClassesFromPopFrame(popin, "loading-failed");
		Popins.addClassesToPopFrame(popin, "loading");
	},

	//	Called by: extracts.js
	setPopFrameStateLoadingFailed: (popin) => {
		Popins.removeClassesFromPopFrame(popin, "loading");
		Popins.addClassesToPopFrame(popin, "loading-failed");
	},

	//	Called by: extracts.js
	clearPopFrameState: (popin) => {
		Popins.removeClassesFromPopFrame(popin, "loading", "loading-failed");

		//	Clear provisional popin height (inherited from parent popin).
		popin.style.height = "";
	},

	//	Called by: Popins.injectPopinForTarget
	//	Called by: extracts.js
	scrollPopinIntoView: (popin) => {
		let popinViewportRect = Popins.getPopinViewportRect(popin);

		if (popin.closest(".markdownBody") == null) {
			popin.style.top = "0";
		} else {
			let windowScrollOffsetForThisPopin = parseInt(popin.dataset.windowScrollOffset ?? '0');

			let scrollWindowBy = 0;
			if (popinViewportRect.bottom > window.innerHeight - Popins.windowBottomPopinPositionMargin) {
				scrollWindowBy = Math.round(  window.innerHeight * -0.95 
											+ Popins.windowBottomPopinPositionMargin 
											+ popinViewportRect.bottom);
			} else if (popinViewportRect.top < 0 + Popins.windowTopPopinPositionMargin) {
				scrollWindowBy = Math.round(  window.innerHeight * -0.10 
											- Popins.windowTopPopinPositionMargin 
											+ popinViewportRect.top);
			}

			if (scrollWindowBy > 0) {
				window.scrollBy(0, scrollWindowBy);
				popin.dataset.windowScrollOffset = windowScrollOffsetForThisPopin + scrollWindowBy;
			}
		}

		//	Set scroll view height.
		popin.body.style.setProperty("--popframe-scroll-view-height", popin.scrollView.clientHeight + "px");
	},

	//	Called by: Popins.cleanup
	removeAllPopins: () => {
		while (Popins.getTopPopin())
			Popins.removePopin(Popins.getTopPopin());
	},

	//	Called by: extracts.js
	cleanPopinsFromContainer: (container) => {
		GWLog("Popins.cleanPopinsFromContainer", "popins.js", 2);

		container.querySelectorAll(".popin").forEach(popin => {
			popin.remove();
		});
		container.querySelectorAll(".popin-ancestor").forEach(popinAncestor => {
			popinAncestor.classList.remove("popin-ancestor");
		});
		container.querySelectorAll(".popin-open").forEach(popinSpawningTarget => {
			popinSpawningTarget.classList.remove("popin-open", "highlighted");
		});
	},

	//	Called by: Popins.cleanup
	//	Called by: Popins.targetClicked (event handler)
	//	Called by: Popins.removeTarget
	//	Called by: Popins.titleBarComponents.closeButton
	//	Called by: Popins.injectPopinForTarget
	removePopin: (popin) => {
		GWLog("Popins.removePopin", "popins.js", 2);

		//  If there’s another popin in the ‘stack’ below this one…
		let popinBelow = popin.nextElementSibling?.classList.contains("popin")
						 ? popin.nextElementSibling
						 : null;

		//	Save place.
		let ancestor = popin.parentElement;

		//	Fire event.
		GW.notificationCenter.fireEvent("Popins.popinWillDespawn", { popin: popin });

		//  Detach popin from its spawning target.
		Popins.detachPopinFromTarget(popin);

		//  Remove popin from page.
		popin.remove();

		//	Remove from spawned popins stack.
		Popins.spawnedPopins.remove(popin);

		//  … restore its scroll state.
		if (popinBelow) {
			popinBelow.scrollView.scrollTop = popinBelow.lastScrollTop;
		} else {
			do { ancestor.classList.remove("popin-ancestor"); }
			while (ancestor = ancestor.parentElement);
		}

		//	Restore the window’s scroll state to before the popin was injected.
		window.scrollBy(0, -1 * parseInt(popin.dataset.windowScrollOffset ?? '0'));
	},

	//	Called by: Popins.injectPopinForTarget
	attachPopinToTarget: (popin, target) => {
		GWLog("Popins.attachPopinToTarget", "popups.js", 2);

		target = target ?? popin.spawningTarget;

        target.classList.add("popin-open");
        target.popin = popin;
        target.popFrame = popin;

		popin.spawningTarget = target;
	},

	//	Called by: Popins.removePopin
	detachPopinFromTarget: (popin, target) => {
		GWLog("Popins.detachPopinFromTarget", "popins.js", 2);

		target = target ?? popin.spawningTarget;

		target.popin = null;
		target.popFrame = null;
		target.classList.remove("popin-open", "highlighted");
	},

	isSpawned: (popin) => {
		return (   popin != null
				&& popin.parentElement != null);
	},

	/*******************/
	/*	Event listeners.
		*/

	//	Added by: Popins.addTarget
	targetClicked: (event) => {
		GWLog("Popins.targetClicked", "popins.js", 2);

		//	Only unmodified click events should trigger popin spawn.
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;

		event.preventDefault();

		Popins.injectPopinForTarget(event.target.closest(".spawns-popin"));

		document.activeElement.blur();
	},

	//	A click (tap) on the popin (which will actually be the popin backdrop).
	popinClicked: (event) => {
		GWLog("Popins.popinClicked", "popins.js", 2);

		/*	If this isn’t a tap directly on the popin itself (i.e., if the event
			has bubbled up from a descendant element), we do nothing.
		 */
		if (event.target.classList.contains("popin") == false)
			return;

		event.stopPropagation();

		Popins.removePopin(event.target);
	},

	//	A click (tap) on a popin title-link.
	popinTitleBarLinkClicked: (event) => {
		GWLog("Popins.popinClicked", "popins.js", 2);

		let link = event.target.closest("a");
		if (   link.hostname == location.hostname
			&& link.pathname == location.pathname
			&& link.target == "_self")
			Popins.removePopin(Popins.containingPopFrame(link));
	},

	/*  The keyup event.
		*/
	//	Added by: Popins.setup
	keyUp: (event) => {
		GWLog("Popins.keyUp", "popins.js", 3);
		let allowedKeys = [ "Escape", "Esc" ];
		if (!allowedKeys.includes(event.key))
			return;

		event.preventDefault();

		switch(event.key) {
			case "Escape":
			case "Esc":
				let popin = Popins.getTopPopin();
				if (popin)
					Popins.removePopin(popin);
				break;
			default:
				break;
		}
	}
};

GW.notificationCenter.fireEvent("Popins.didLoad");
Annotations = {
	basePathname: "/metadata/annotation/",

	annotatedLinkFullClass: "link-annotated",
	annotatedLinkPartialClass: "link-annotated-partial"
};

Annotations = { ...Annotations,
    /***********/
    /*  General.
     */

	isAnnotatedLink: (link) => {
		return link.classList.containsAnyOf([ Annotations.annotatedLinkFullClass,  Annotations.annotatedLinkPartialClass ]);
	},

	isAnnotatedLinkFull: (link) => {
		return link.classList.contains(Annotations.annotatedLinkFullClass);
	},

	isAnnotatedLinkPartial: (link) => {
		return link.classList.contains(Annotations.annotatedLinkPartialClass);
	},

    allAnnotatedLinksInContainer: (container) => {
        return Array.from(container.querySelectorAll("a[class*='link-annotated']")).filter(link => Annotations.isAnnotatedLink(link));
    },

    /*  Returns the target identifier: the relative url (for local links),
    	or the full URL (for foreign links).

        Used for loading annotations, and caching reference data.
     */
	targetIdentifier: (target) => {
		return (target.hostname == location.hostname
			   ? (target.pathname.endsWith("/") 
			   	  ? target.pathname + "index" 
			   	  : target.pathname) + target.hash
			   : (target instanceof HTMLAnchorElement
			   	  ? target.getAttribute("href")
			   	  : target.href));
	},

	shouldLocalizeContentFromLink: (link) => {
		return false;
	},

	/***********/
	/*	Caching.
	 */

	//	Convenience method.
	cachedDocumentForLink: (link) => {
		return (Annotations.cachedReferenceDataForLink(link)?.document ?? null);
	},

	loadingFailedString: "LOADING_FAILED",

    /*  Storage for retrieved and cached annotations.
     */
    cachedReferenceData: { },

	referenceDataCacheKeyForLink: (link) => {
		return Annotations.targetIdentifier(link);
	},

	cachedReferenceDataForLink: (link) => {
		return Annotations.cachedReferenceData[Annotations.referenceDataCacheKeyForLink(link)];
	},

	cacheReferenceDataForLink: (referenceData, link) => {
		Annotations.cachedReferenceData[Annotations.referenceDataCacheKeyForLink(link)] = referenceData;
	},

    /*  Returns true iff cached reference data exists for the given link.
     */
    //	Called by: Extracts.setUpAnnotationLoadEventsWithin (extracts-annotations.js)
    cachedDataExists: (link) => {
    	let referenceData = Annotations.cachedReferenceDataForLink(link);
		return (   referenceData != null
				&& referenceData != Annotations.loadingFailedString);
    },

    /*  Returns cached annotation reference data for a given link, or else
    	either “LOADING_FAILED” (if loading the annotation was attempted but
    	failed) or null (if the annotation has not been loaded).
     */
    referenceDataForLink: (link) => {
    	return Annotations.cachedReferenceDataForLink(link);
    },

	/***********/
	/*	Loading.
	 */

	/*	Returns the URL of the annotation resource for the given link.
	 */
	//	Called by: Annotations.load
	//	Called by: Annotations.cachedAPIResponseForLink
	//	Called by: Annotations.cacheAPIResponseForLink
	sourceURLForLink: (link) => {
		return URLFromString(  Annotations.basePathname
							 + fixedEncodeURIComponent(fixedEncodeURIComponent(Annotations.targetIdentifier(link)))
							 + ".html");
	},

	waitForDataLoad: (link, loadHandler = null, loadFailHandler = null) => {
		let referenceData = Annotations.referenceDataForLink(link);
		if (referenceData != null) {
			if (referenceData == Annotations.loadingFailedString) {
				if (loadFailHandler)
					loadFailHandler(link);
			} else {
				if (loadHandler)
					loadHandler(link);
			}

			return;
		}

		let didLoadHandler = (info) => {
            if (loadHandler)
            	loadHandler(link);

			GW.notificationCenter.removeHandlerForEvent("Annotations.annotationLoadDidFail", loadDidFailHandler);
        };
        let loadDidFailHandler = (info) => {
            if (loadFailHandler)
            	loadFailHandler(link);

			GW.notificationCenter.removeHandlerForEvent("Annotations.annotationDidLoad", didLoadHandler);
        };
		let options = {
        	once: true,
        	condition: (info) => info.link == link
        };

        GW.notificationCenter.addHandlerForEvent("Annotations.annotationDidLoad", didLoadHandler, options);
        GW.notificationCenter.addHandlerForEvent("Annotations.annotationLoadDidFail", loadDidFailHandler, options);
	},

    /*  Load and process the annotation for the given link.
     */
    //	Called by: Extracts.setUpAnnotationLoadEventsWithin (extracts-annotations.js)
    load: (link, loadHandler = null, loadFailHandler = null) => {
        GWLog("Annotations.load", "annotations.js", 2);

		//	Get URL of the annotation resource.
        let sourceURL = Annotations.sourceURLForLink(link);

		//	Retrieve, parse, process, and cache the annotation data.
		doAjax({
			location: sourceURL.href,
			onSuccess: (event) => {
				let responseDocument = newDocument(event.target.responseText);

				//	Request the page image thumbnail, to cache it.
				let pageImage = responseDocument.querySelector(".page-thumbnail");
				if (   pageImage != null 
					&& Images.isSVG(pageImage) == false)
					doAjax({ location: Images.thumbnailURLForImage(pageImage) });

				/*	Construct and cache a reference data object, then fire the
					appropriate event.
				 */
				Annotations.cacheReferenceDataForLink(Annotations.referenceDataFromParsedAPIResponse(responseDocument, link), link);

				GW.notificationCenter.fireEvent("Annotations.annotationDidLoad", {
					link: link
				});
			},
			onFailure: (event) => {
				Annotations.cacheReferenceDataForLink(Annotations.loadingFailedString, link);

				GW.notificationCenter.fireEvent("Annotations.annotationLoadDidFail", { link: link });

				//	Send request to record failure in server logs.
				GWServerLogError(sourceURL.href + `--${event.target.status}`, "missing annotation");
			}
		});

		//	Call any provided handlers, if/when appropriate.
		if (loadHandler || loadFailHandler)
			Annotations.waitForDataLoad(link, loadHandler, loadFailHandler);
    },

	//	Called by: Annotations.load
	referenceDataFromParsedAPIResponse: (response, link) => {
		let titleLink = response.querySelector([ Annotations.annotatedLinkFullClass,
												 Annotations.annotatedLinkPartialClass
												 ].map(className => `a.${className}`).join(", "));

		//	Strip date ranges (if any).
		stripDateRangeMetadataInBlock(titleLink);

		//	On mobile, use mobile-specific link href, if provided.
		let titleLinkHref = (   titleLink.dataset.hrefMobile
							 && GW.isMobile())
							? titleLink.dataset.hrefMobile
							: titleLink.href;

		//	Construct title link class.
		let titleLinkClasses = [ "title-link" ];

		/*  Import link classes (excluding the ones that designate annotated 
			links, lest we have infinite recursion of annotation popups).
		 */
		titleLinkClasses.push(...(Array.from(titleLink.classList).filter(titleLinkClass => [
			"link-annotated",
			"link-annotated-partial"
		].includes(titleLinkClass) == false)));

		//	Special handling for links with separate ‘iframe’ URLs.
		if (titleLink.dataset.urlIframe)
			titleLinkClasses.push("link-live");

		//	Data attributes for the title link.
		let titleLinkDataAttributes = [ ];
		for (let [ attrName, attrValue ] of Object.entries(titleLink.dataset))
			titleLinkDataAttributes.push(`data-${(attrName.camelCaseToKebabCase())}="${attrValue}"`);

		/*	Import link icon data attributes from the annotated link itself 
			(but do not replace ones already specified by the annotation 
			 title-link).
		 */
		for (let [ attrName, attrValue ] of Object.entries(link.dataset))
			if (   attrName.startsWith("linkIcon")
				&& titleLink.dataset[attrName] == null)
				titleLinkDataAttributes.push(`data-${(attrName.camelCaseToKebabCase())}="${attrValue}"`);

		//	Stringify data attributes.
		titleLinkDataAttributes = (titleLinkDataAttributes.length > 0
								   ? titleLinkDataAttributes.join(" ")
								   : null);

		//  Author list.
		let authorHTML = null;
		let authorElement = response.querySelector(".author");
		if (authorElement) {
			let authorListClass = [ "data-field", ...(authorElement.classList) ].join(" ");
			authorHTML = `<span class="${authorListClass}">${authorElement.innerHTML}</span>`
		}

		//  Date.
		let dateHTML = null;
		let dateElement = response.querySelector(".date");
		if (dateElement) {
			let dateClass = [ "data-field", ...(dateElement.classList) ].join(" ");
			dateHTML = `<span class="${dateClass}" title="${dateElement.textContent}">`
					 + dateElement.textContent.replace(/-[0-9][0-9]-[0-9][0-9]$/, "")
					 + `</span>`;
		}

		//	Link tags.
		let tagsHTML = null;
		let tagsElement = response.querySelector(".link-tags");
		if (tagsElement) {
			let tagsListClass = [ "data-field", ...(tagsElement.classList) ].join(" ");
			tagsHTML = `<span class="${tagsListClass}">${tagsElement.innerHTML}</span>`;
		}

		//	The backlinks link (if exists).
		let backlinksElement = response.querySelector(".backlinks");
		let backlinksHTML = backlinksElement
							? `<span
								class="data-field aux-links backlinks"
								>${backlinksElement.innerHTML}</span>`
							: null;

		//	The similar-links link (if exists).
		let similarsElement = response.querySelector(".similars");
		let similarsHTML = similarsElement
						   ? `<span
							   class="data-field aux-links similars"
							   >${similarsElement.innerHTML}</span>`
						   : null;

		//	The link-link-bibliography link (if exists).
		let linkbibElement = response.querySelector(".link-bibliography");
		let linkbibHTML = linkbibElement
						  ? `<span
							  class="data-field aux-links link-bibliography"
							  >${linkbibElement.innerHTML}</span>`
						  : null;

		//	All the aux-links (tags, backlinks, similars, link link-bib).
		let auxLinksHTML = ([ backlinksHTML, similarsHTML, linkbibHTML ].filter(x => x).join(", ") || null);
		if (auxLinksHTML || tagsHTML)
			auxLinksHTML = `<span class="aux-links-field-container"> (${([ tagsHTML, auxLinksHTML ].filter(x => x).join("; ") || null)})</span>`;

		//  Combined author, date, & aux-links.
		let authorDateAuxHTML = ([ authorHTML, dateHTML, auxLinksHTML ].filter(x => x).join("") || null);

		//	Abstract (if exists).
		let abstractElement = response.querySelector("blockquote");
		let abstractHTML = null;
		let thumbnailFigureHTML = null;
		if (abstractElement) {
			let abstractDocument = newDocument(abstractElement.childNodes);

			//	Request image inversion judgments from invertOrNot.
			requestImageInversionJudgmentsForImagesInContainer(abstractDocument);

			//	Request image outlining judgments from outlineOrNot.
			requestImageOutliningJudgmentsForImagesInContainer(abstractDocument);

			//	Post-process abstract.
			Annotations.postProcessAnnotationAbstract(abstractDocument, link);

			//	Retrieve thumbnail HTML (if set).
			thumbnailFigureHTML = abstractDocument.thumbnailFigureHTML;

			abstractHTML = abstractDocument.innerHTML;
		}

		//	File includes (if any).
		let fileIncludesElement = response.querySelector(".aux-links-transclude-file");
		let fileIncludesHTML = null;
		if (fileIncludesElement) {
			/*	Remove any file embed links that lack a valid content
				type (e.g., foreign-site links that have not been
				whitelisted for embedding).
			 */
			Transclude.allIncludeLinksInContainer(fileIncludesElement).forEach(includeLink => {
				if (Content.contentTypeForLink(includeLink) == null)
					includeLink.remove();
			});

			/*	Set special template for file includes of content transforms.
			 */
			Transclude.allIncludeLinksInContainer(fileIncludesElement).forEach(includeLink => {
				if (   Content.isContentTransformLink(includeLink)
					&& includeLink.dataset.includeTemplate == null)
					includeLink.dataset.includeTemplate = "$annotationFileIncludeTemplate";
			});

			/*	Do not include the file includes section if no valid
				include-links remain.
			 */
			if (isNodeEmpty(fileIncludesElement) == false)
				fileIncludesHTML = fileIncludesElement.innerHTML;
		}

		//	TItle bar link should go to /ref/ page for the annotation.
		let popFrameTitleLinkHref = "/ref/" + (link.id || titleLink.id.slice("link-bibliography-".length));

		return {
			document: response,
			content: {
				title:                    titleLink.innerHTML,
				titleLinkHref:            titleLinkHref,
				titleLinkClass:           titleLinkClasses.join(" "),
				titleLinkDataAttributes:  titleLinkDataAttributes,
				author:                   authorHTML,
				date:                     dateHTML,
				auxLinks:                 auxLinksHTML,
				authorDateAux:            authorDateAuxHTML,
				abstract:                 abstractHTML,
				thumbnailFigure:          thumbnailFigureHTML,
				fileIncludes:             fileIncludesHTML
			},
			template:                     "annotation-blockquote-inside",
			popFrameTemplate:             "annotation-blockquote-not",
			popFrameTitle:                titleLink.cloneNode(true).trimQuotes().innerHTML,
			popFrameTitleLinkHref:        popFrameTitleLinkHref
		};
	},

	/*  Post-process an already-constructed local annotation
		(do HTML cleanup, etc.).
	 */
	postProcessAnnotationAbstract: (abstractDocument, link = null) => {
		//	Unwrap extraneous <div>s, if present.
		if (   abstractDocument.firstElementChild == abstractDocument.lastElementChild
			&& abstractDocument.firstElementChild.tagName == "DIV")
			unwrap(abstractDocument.firstElementChild);

		//	If there’s a “See Also” section, rectify its classes.
		let seeAlsoList = abstractDocument.querySelector(_π(".see-also-append", " ", [ "ul", "ol" ]).join(", "));
		if (seeAlsoList) {
			seeAlsoList.classList.add("aux-links-list", "see-also-list");

			let listLabel = previousBlockOf(seeAlsoList, { notBlockElements: [ ".columns" ] });
			if (listLabel)
				listLabel.classList.add("aux-links-list-label", "see-also-list-label");
		}

		//	Prevent erroneous collapse class.
		abstractDocument.querySelectorAll(".aux-links-append.collapse").forEach(auxLinksAppendCollapse => {
			auxLinksAppendCollapse.classList.add("bare-content-not");
		});

		//	Unwrap more extraneous <div>s, if present.
		let pageDescriptionClass = "page-description-annotation";
		let pageDescription = abstractDocument.querySelector(`div.${pageDescriptionClass}`);
		if (pageDescription)
			pageDescription = unwrap(pageDescription, { moveClasses: [ pageDescriptionClass ] });

		//	Page thumbnail.
		let pageThumbnail = abstractDocument.querySelector("img.page-thumbnail");
		if (pageThumbnail) {
			//	Replace full-size page image with thumbnail.
			Images.thumbnailifyImage(pageThumbnail);

			//	Make page image thumbnail load eagerly instead of lazily.
			pageThumbnail.loading = "eager";
			pageThumbnail.decoding = "sync";

			/*	On sufficiently wide viewports, pull out thumbnail figure
				for proper floating.
			 */
			let pageThumbnailFigure = pageThumbnail.closest("figure");
			if (GW.mediaQueries.mobileWidth.matches == false) {
				abstractDocument.thumbnailFigureHTML = pageThumbnailFigure.outerHTML;
				pageThumbnailFigure.remove();
			} else if (pageDescription) {
				abstractDocument.insertBefore(pageThumbnailFigure, pageDescription.last.nextElementSibling);
			}
		}
	},
};

//	Fire load event.
GW.notificationCenter.fireEvent("Annotations.didLoad");
Content = {
    /*******************/
    /*  Content caching.
     */

    cachedContent: { },

    contentCacheKeyForLink: (link) => {
    	return (   Content.contentTypeForLink(link)?.contentCacheKeyForLink?.(link)
    			?? (Content.sourceURLsForLink(link)?.first ?? link).href);
    },

    cacheContentForLink: (content, link) => {
        Content.cachedContent[Content.contentCacheKeyForLink(link)] = content;
    },

    cachedContentForLink: (link) => {
        //  Special case for the link being to the current page.
        if (   link.pathname == location.pathname
            && Content.cachedContent[Content.contentCacheKeyForLink(link)] == null)
            Content.load(link);

        return Content.cachedContent[Content.contentCacheKeyForLink(link)];
    },

    cachedDocumentForLink: (link) => {
        let content = Content.cachedContentForLink(link);
        return (content && content != "LOADING_FAILED"
                ? content.document
                : null);
    },

    cachedDataExists: (link) => {
        let cachedContent = Content.cachedContentForLink(link);
        return (   cachedContent != null
                && cachedContent != "LOADING_FAILED");
    },

    updateCachedContent: (link, updateFunction) => {
        if (Content.cachedDataExists(link) == false)
            return;

        let content = Content.cachedContentForLink(link);

		let didUpdate = false;
        switch (Content.contentTypeForLink(link)) {
            case Content.contentTypes.localPage:
                didUpdate = updateFunction(content.document);
                break;
            default:
                break;
        }

		if (didUpdate)
			Content.invalidateCachedReferenceDataForLink(link);
    },

	invalidateCachedContent: (link) => {
		Content.cachedContent[Content.contentCacheKeyForLink(link)] = null;
		Content.invalidateCachedReferenceDataForLink(link);
	},

    /*******************/
    /*  Content loading.
     */

    sourceURLsForLink: (link) => {
        return Content.contentTypeForLink(link)?.sourceURLsForLink?.(link);
    },

    waitForDataLoad: (link, loadHandler = null, loadFailHandler = null) => {
        if (Content.cachedContentForLink(link) == "LOADING_FAILED") {
            if (loadFailHandler)
                loadFailHandler(link);

            return;
        } else if (Content.cachedContentForLink(link)) {
            if (loadHandler)
                loadHandler(link);

            return;
        }

        let didLoadHandler = (info) => {
            if (loadHandler)
                loadHandler(link);

            GW.notificationCenter.removeHandlerForEvent("Content.contentLoadDidFail", loadDidFailHandler);
        };
        let loadDidFailHandler = (info) => {
            if (loadFailHandler)
                loadFailHandler(link);

            GW.notificationCenter.removeHandlerForEvent("Content.contentDidLoad", didLoadHandler);
        };
        let options = {
            once: true,
            condition: (info) => (info.link == link)
        };

        GW.notificationCenter.addHandlerForEvent("Content.contentDidLoad", didLoadHandler, options);
        GW.notificationCenter.addHandlerForEvent("Content.contentLoadDidFail", loadDidFailHandler, options);
    },

    load: (link, loadHandler = null, loadFailHandler = null, sourceURLsRemaining = null) => {
        GWLog("Content.load", "content.js", 2);

        sourceURLsRemaining = sourceURLsRemaining ?? Content.sourceURLsForLink(link);
        let sourceURL = sourceURLsRemaining?.shift();

        let processResponse = (response) => {
            let content = Content.contentFromLink?.(link) ?? Content.contentFromResponse?.(response, link, sourceURL);
            if (content?.document) {
                Content.cacheContentForLink(content, link);

                GW.notificationCenter.fireEvent("Content.contentDidLoad", {
                    link: link
                });
            } else if (content?.loadURLs) {
            	sourceURLsRemaining = sourceURLsRemaining ?? [ ];
            	sourceURLsRemaining.unshift(...(content.loadURLs));

				Content.load(link, null, null, sourceURLsRemaining);
				return;
            } else {
                Content.cacheContentForLink("LOADING_FAILED", link);

                GW.notificationCenter.fireEvent("Content.contentLoadDidFail", {
                    link: link
                });

                //  Send request to record failure in server logs.
                GWServerLogError(link.href + `--could-not-process`, "problematic content");
            }
        };

        if (   sourceURL == null
            || sourceURL.pathname == location.pathname) {
            processResponse();
        } else {
            doAjax({
                location: sourceURL.href,
                onSuccess: (event) => {
                	let permittedContentTypes = Content.contentTypeForLink(link).permittedContentTypes;
                	let httpContentType = event.target.getResponseHeader("Content-Type")?.match(/(.+?)(?:;|$)/)[1];
                	if (permittedContentTypes?.includes(httpContentType) == false) {
                        //  Send request to record failure in server logs.
                        GWServerLogError(link.href + `--bad-content-type` + `--${httpContentType}`, "bad content type");

                        return;
                	}

                    processResponse(event.target.responseText);
                },
                onFailure: (event) => {
                    if (sourceURLsRemaining.length > 0) {
                        Content.load(link, null, null, sourceURLsRemaining);
                        return;
                    }

                    Content.cacheContentForLink("LOADING_FAILED", link);

                    GW.notificationCenter.fireEvent("Content.contentLoadDidFail", {
                        link: link
                    });

                    //  Send request to record failure in server logs.
                    GWServerLogError(link.href + `--missing-content` + `--${event.target.status}`, "missing content");
                },
				headers: Content.contentTypeForLink(link).additionalAPIRequestHeaders
            });
        }

        //  Call any provided handlers, if/when appropriate.
        if (loadHandler || loadFailHandler)
            Content.waitForDataLoad(link, loadHandler, loadFailHandler);
    },

    contentFromLink: (link) => {
        return Content.contentTypeForLink(link)?.contentFromLink?.(link);
    },

    contentFromResponse: (response, link, sourceURL) => {
        return Content.contentTypeForLink(link)?.contentFromResponse?.(response, link, sourceURL);
    },

    /**************************************/
    /*  Reference data retrieval & caching.
     */

    cachedReferenceData: { },

	referenceDataCacheKeyForLink: (link) => {
		return (Content.contentTypeForLink(link)?.referenceDataCacheKeyForLink?.(link) ?? null);
	},

	cachedReferenceDataForLink: (link) => {
		let cacheKey = Content.referenceDataCacheKeyForLink(link);
		if (cacheKey)
			return Content.cachedReferenceData[cacheKey];

		return null;
	},

	cacheReferenceDataForLink: (referenceData, link) => {
		let cacheKey = Content.referenceDataCacheKeyForLink(link);
		if (cacheKey)
			Content.cachedReferenceData[cacheKey] = referenceData;
	},

	invalidateCachedReferenceDataForLink: (link) => {
		let contentType = Content.contentTypeForLink(link);
		if (contentType?.referenceDataCacheKeyForLink == null)
			return;
		for (let [ cacheKey, referenceData ] of Object.entries(Content.cachedReferenceData)) {
			if (contentType.referenceDataCacheKeyMatchesLink) {
				if (contentType.referenceDataCacheKeyMatchesLink(cacheKey, link))
					Content.cachedReferenceData[cacheKey] = null;
			} else {
				if (contentType.referenceDataCacheKeyForLink(link) == cacheKey)
					Content.cachedReferenceData[cacheKey] = null;
			}
		}
	},

    referenceDataForLink: (link) => {
        let content = Content.cachedContentForLink(link);
        if (   content == null
            || content == "LOADING_FAILED") {
            return content;
        } else {
			let referenceData = Content.cachedReferenceDataForLink(link);
			if (referenceData == null) {
				referenceData = Content.referenceDataFromContent(content, link);
				Content.cacheReferenceDataForLink(referenceData, link);
			}
			return referenceData;
        }
    },

    referenceDataFromContent: (content, link) => {
    	let contentType = Content.contentTypeForLink(link);
    	return (contentType.referenceDataFromContent
    			? contentType.referenceDataFromContent(content, link)
    			: { content: content.document });
    },

    /***********/
    /*  Helpers.
     */

	isContentTransformLink: (link) => {
		return ([ "tweet",
        		  "wikipediaEntry",
        		  "githubIssue"
        		  ].findIndex(x => Content.contentTypes[x].matches(link)) !== -1);
	},

	shouldLocalizeContentFromLink: (link) => {
		return Content.referenceDataForLink(link)?.shouldLocalize ?? false;
	},

    objectHTMLForURL: (url, options) => {
		options = Object.assign({
			additionalClasses: null,
			additionalAttributes: null
		}, options);

        if (typeof url == "string")
            url = URLFromString(url);

        /*	PDF optional settings to embed more cleanly: fit width, and disable
        	‘bookmarks’ & ‘thumbnails’ (just not enough space).

        	<https://gwern.net/doc/cs/css/2007-adobe-parametersforopeningpdffiles.pdf#page=6>
        	<https://github.com/mozilla/pdf.js/wiki/Viewer-options>

        	WARNING: browsers are unreliable in whether they properly apply
        	these options; Firefox appears to, but not Chrome, and there can be
        	iframe issues as well.
         */
        let src = url.pathname.endsWith(".pdf")
                  ? url.href + (url.hash ? "&" : "#") + "view=FitH&pagemode=none"
                  : url.href;

        let cssClass = [ "loaded-not" ];
        if (url.pathname.endsWith(".pdf"))
        	cssClass.push("pdf");
        if (options.additionalClasses)
        	cssClass.push(options.additionalClasses);
        cssClass = cssClass.join(" ");

        return `<iframe
                    src="${src}"
                    frameborder="0"
                    class="${cssClass}"
                    ${(options.additionalAttributes ?? "")}
                        ></iframe>`;
    },

    figcaptionHTMLForMediaLink: (link) => {
        let captionHTML = ``;
        if (Annotations.isAnnotatedLink(link))
            captionHTML = "<figcaption>" + synthesizeIncludeLink(link, {
                "class": "include-annotation include-strict",
                "data-include-selector": ".annotation-abstract > *",
                "data-include-selector-not": ".aux-links-append",
                "data-include-template": "annotation-blockquote-not"
            }).outerHTML + "</figcaption>";
        return captionHTML;
    },

    mediaDimensionsHTMLForMediaLink: (link) => {
        let parts = [ ];
        if (link.dataset.aspectRatio)
            parts.push(`data-aspect-ratio="${(link.dataset.aspectRatio)}"`);
        if (link.dataset.imageWidth)
            parts.push(`width="${(link.dataset.imageWidth)}"`);
        if (link.dataset.imageHeight)
            parts.push(`height="${(link.dataset.imageHeight)}"`);
        return parts.join(" ");
    },

    removeExtraneousClassesFromMediaElement: (media) => {
        //  Remove various link classes.
        media.classList.remove("icon-not", "link-page", "link-live",
            "link-annotated", "link-annotated-partial", "link-annotated-not",
            "has-annotation", "has-annotation-partial", "has-content",
            "has-icon", "has-indicator-hook", "spawns-popup", "spawns-popin");

        //  Remove all `include-` classes.
        media.classList.remove(...(Array.from(media.classList).filter(x => x.startsWith("include-"))));
    },

    /**************************************************************/
    /*  CONTENT TYPES

        Each content type definition has the following REQUIRED members:

            .matches(URL|Element) => boolean

            .isSliceable: boolean

				This property determines whether content documents returned for
				links of this content type may be “sliced”, via element IDs,
				selectors, or by other means. If its value is false, then the
				returned content documents may only be transcluded in their
				entirety.

        ... plus either these two:

            .sourceURLsForLink(URL|Element) => [ URL ]

            .contentFromResponse(string, URL|Element, URL) => object

        ... or this one:

            .contentFromLink(URL|Element) => object

        A content type definition may also have the following OPTIONAL members:

			.contentCacheKeyForLink(URL|Element) => string

				If this member function is not present, a default content cache
				key (based on the first source URL for the link, or else the URL
				of the link itself) will be used.

            .referenceDataFromContent(object, URL|Element) => object

				NOTE: If this member function is not present, we must ensure
				that the object returned from .contentFromResponse() or
				.contentFromLink() has a .document member. (This should be a
				DocumentFragment object which contains the primary content for
				the link.)

			.referenceDataCacheKeyForLink(URL|Element) => string

				NOTE: If this member function is not present, then reference
				data will not be cached for links of this content type.

			.referenceDataCacheKeyMatchesLink(string, URL|Element) => boolean

				Used when invalidating cached reference data. Should be supplied
				if a single loaded content entry may generate multiple reference
				data entries, for multiple different reference data cache keys.
     */

    contentTypeForLink: (link) => {
		if (link.dataset?.linkContentType) {
			let contentTypeName = link.dataset.linkContentType.kebabCaseToCamelCase();
			let contentType = Content.contentTypes[contentTypeName];
			if (contentType?.matches(link))
				return contentType;
		}

        for (let [ contentTypeName, contentType ] of Object.entries(Content.contentTypes))
            if (contentType.matches(link))
                return contentType;

        return null;
    },

	contentTypeNameForLink: (link) => {
		if (link.dataset?.linkContentType) {
			let contentTypeName = link.dataset.linkContentType.kebabCaseToCamelCase();
			let contentType = Content.contentTypes[contentTypeName];
			if (contentType?.matches(link))
				return contentTypeName;
		}

        for (let [ contentTypeName, contentType ] of Object.entries(Content.contentTypes))
            if (contentType.matches(link))
                return contentTypeName;

        return null;
	},

    contentTypes: {
        dropcapInfo: {
            matches: (link) => {
                return (link.classList?.contains("link-dropcap") == true);
            },

            isSliceable: false,

            contentFromLink: (link) => {
                let letter = link.dataset.letter;
                let dropcapType = link.dataset.dropcapType;

                let contentDocument = newDocument(
                      `<p>A capital letter <strong>${letter}</strong> dropcap initial, from the `
                    + `<a class="link-page" href="/dropcap#${dropcapType}"><strong>${dropcapType}</strong></a>`
                    + ` dropcap font.</p>`
                );

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.dropcapInfo.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: new URL(link.href)
                });

                return {
                	document: contentDocument
                };
            }
        },

        foreignSite: {
            matches: (link) => {
                //  Some foreign-site links are handled specially.
                if ([ "tweet",
                	  "wikipediaEntry",
                	  "githubIssue",
                      "remoteVideo",
                      "remoteImage"
                      ].findIndex(x => Content.contentTypes[x].matches(link)) !== -1)
                    return false;

                //  Account for alternate and archive URLs.
                let url = URLFromString(link.dataset?.urlArchive ?? link.dataset?.urlIframe ?? link.href);

                return (   url.hostname != location.hostname
                        && link.classList?.contains("link-live") == true);
            },

            isSliceable: false,

            contentFromLink: (link) => {
                //  WARNING: EXPERIMENTAL FEATURE!
//              if (localStorage.getItem("enable-embed-proxy") == "true") {
//                  let url = URLFromString(embedSrc);
//                  let proxyURL = URLFromString("https://api.obormot.net/embed.php");
//                  doAjax({
//                      location: proxyURL.href,
//                      params: { url: url.href },
//                      onSuccess: (event) => {
//                          if (Extracts.popFrameProvider.isSpawned(target.popFrame) == false)
//                              return;
//
//                          let doc = newElement("DIV", null, { "innerHTML": event.target.responseText });
//                          doc.querySelectorAll("[href], [src]").forEach(element => {
//                              if (element.href) {
//                                  let elementURL = URLFromString(element.href);
//                                  if (   elementURL.host == location.host
//                                      && !element.getAttribute("href").startsWith("#")) {
//                                      elementURL.host = url.host;
//                                      element.href = elementURL.href;
//                                  }
//                              } else if (element.src) {
//                                  let elementURL = URLFromString(element.src);
//                                  if (elementURL.host == location.host) {
//                                      elementURL.host = url.host;
//                                      element.src = elementURL.href;
//                                  }
//                              }
//                          });
//
//                          if (event.target.getResponseHeader("content-type").startsWith("text/plain"))
//                              doc.innerHTML = `<pre>${doc.innerHTML}</pre>`;
//
//                          target.popFrame.document.querySelector("iframe").srcdoc = doc.innerHTML;
//
//                          Extracts.postRefreshUpdatePopFrameForTarget(target, true);
//                      },
//                      onFailure: (event) => {
//                          if (Extracts.popFrameProvider.isSpawned(target.popFrame) == false)
//                              return;
//
//                          Extracts.postRefreshUpdatePopFrameForTarget(target, false);
//                      }
//                  });
//
//                  return newDocument(`<iframe frameborder="0" sandbox="allow-scripts allow-popups"></iframe>`);
//              }
                //  END EXPERIMENTAL SECTION

                let embedSrc = link.dataset.urlArchive ?? link.dataset.urlIframe ?? link.href;
                let additionalAttributes = [ ];

                //  Determine sandbox settings.
                additionalAttributes.push(Content.contentTypes.foreignSite.shouldEnableScriptsForURL(URLFromString(embedSrc))
                                          ? `sandbox="allow-scripts allow-same-origin"`
                                          : `sandbox`);

				let contentDocument = newDocument(Content.objectHTMLForURL(embedSrc, {
                    additionalAttributes: additionalAttributes.join(" ")
                }));

                return {
                	document: contentDocument
                };
            },

            shouldEnableScriptsForURL: (url) => {
                if (url.hostname == "docs.google.com")
                    return true;

                if (url.hostname == "demos.obormot.net")
                    return true;

                if (   url.hostname == "archive.org"
                    && url.pathname.startsWith("/details/"))
                    return true;

                return false;
            }
        },

		wikipediaEntry: {
			/*	The Wikipedia API only gives usable responses for most, not all,
				Wikipedia URLs.
			 */
			matches: (link) => {
				return (   link.classList?.contains("content-transform-not") != true
						&& /(.+?)\.wikipedia\.org/.test(link.hostname) == true
						&& link.pathname.startsWith("/wiki/") == true
						&& link.pathname.startsWithAnyOf(_π("/wiki/", [ "File:", "Category:", "Special:", "Wikipedia:Wikipedia_Signpost" ])) == false);
			},

			isSliceable: false,

			sourceURLsForLink: (link) => {
				let apiRequestURL = URLFromString(link.href);

				let wikiPageName = fixedEncodeURIComponent(/\/wiki\/(.+?)$/.exec(decodeURIComponent(apiRequestURL.pathname))[1]);
				apiRequestURL.pathname = `/api/rest_v1/page/html/${wikiPageName}`;
				apiRequestURL.hash = "";

				return [ apiRequestURL ];
			},

            contentFromResponse: (response, link, sourceURL) => {
				let contentDocument = newDocument(response);
				let redirectLink = contentDocument.querySelector("link[rel='mw:PageProp/redirect']");
				if (redirectLink) {
					return {
						loadURLs: Content.contentTypes.wikipediaEntry.sourceURLsForLink(modifiedURL(link, {
							pathname: "/wiki" + redirectLink.getAttribute("href").slice(1)
						}))
					}
				} else {
					return {
						document: contentDocument
					};
				}
            },

			referenceDataCacheKeyForLink: (link) => {
				return link.href;
			},

			referenceDataFromContent: (wikipediaEntryContent, articleLink) => {
				//	Do not show the whole page, by default.
				let wholePage = false;

				//	Show full page (sans TOC) if it’s a disambiguation page.
				if (wikipediaEntryContent.document.querySelector("meta[property='mw:PageProp/disambiguation']") != null) {
					wholePage = true;

					//	Send request to record failure in server logs.
					GWServerLogError(Content.contentTypes.wikipediaEntry.sourceURLsForLink(articleLink).first.href + `--disambiguation-error`, "disambiguation page");
				}

				//	Function to build table of contents for article or section.
				let buildArticleTOC = (sections, baseArticle) => {
					if (   sections == null
						|| sections.length == 0)
						return "";

					let tocHTML = `<div class="TOC columns">`;
					let headingLevel = 0;
					for (let i = 0; i < sections.length; i++) {
						let section = sections[i];
						let headingElement = section.firstElementChild;
						let newHeadingLevel = parseInt(headingElement.tagName.slice(1));
						if (newHeadingLevel > headingLevel)
							tocHTML += `<ul>`;

						if (   i > 0
							&& newHeadingLevel <= headingLevel)
							tocHTML += `</li>`;

						if (newHeadingLevel < headingLevel)
							tocHTML += `</ul>`;

						//	Get heading, parse as HTML, and unwrap links.
						let heading = headingElement.cloneNode(true);
						heading.querySelectorAll("a").forEach(unwrap);

						/*	Construct TOC entry. (We must encode the heading
							id, because the anchor might contain quotes.)
						 */
						let tocLinkHref = modifiedURL(articleLink, { hash: fixedEncodeURIComponent(headingElement.id) }).href;
						tocHTML += `<li><a href="${tocLinkHref}">${(heading.innerHTML)}</a>`;

						headingLevel = newHeadingLevel;
					}
					tocHTML += `</li></ul></div>`;

					return tocHTML;
				};

				//	Function to render a title link component link.
				let renderTitleLinkHTML = (titleLinkHref, titleLinkInnerHTML, contentTransform = false) => {
					//	We use the mobile URL for popping up the live-link.
					let titleLinkHrefForEmbedding = modifiedURL(URLFromString(titleLinkHref), {
						hostname: articleLink.hostname.replace(".wikipedia.org", ".m.wikipedia.org")
					}).href;
					let titleLinkDataAttributes = `data-url-iframe="${titleLinkHrefForEmbedding}"`;

					//	Link icon.
					let titleLinkIconMetadata = `data-link-icon-type="svg" data-link-icon="wikipedia"`;

					//	Transformed or live.
					let titleLinkClass = `title-link ${(contentTransform ? "content-transform" : "link-live content-transform-not")}`;

					//	Template fill context.
					let tfc = Transclude.standardTemplateFillContext;

					return `<a
							 class="${titleLinkClass}"
							 title="Open ${titleLinkHref} in ${tfc.whichTab} ${tfc.tabOrWindow}"
							 href="${titleLinkHref}"
							 target="${tfc.linkTarget}>"
							 ${titleLinkDataAttributes}
							 ${titleLinkIconMetadata}
							 >${titleLinkInnerHTML}</a>`;
				};

				//	Page title.
				let pageTitleHTML = unescapeHTML(wikipediaEntryContent.document.querySelector("title").innerHTML);

				//	Template fields.
				let titleLineHTML, entryContentHTML, thumbnailFigureHTML;
				let popFrameTitle, popFrameTitleLinkHref;
				let contentTypeClass = "wikipedia-entry";

				//	Intermediate values.
				let secondaryTitleLinksHTML = "";

				//	Whole page, one section, or intro+TOC.
				if (wholePage) {
					titleLineHTML = renderTitleLinkHTML(articleLink.href, pageTitleHTML);
					entryContentHTML = wikipediaEntryContent.document.innerHTML;
				} else if (articleLink.hash > "") {
					let targetElement = wikipediaEntryContent.document.querySelector(selectorFromHash(articleLink.hash));

					/*	Check whether we have tried to load a part of the page which
						does not exist.
					 */
					if (targetElement == null) {
						//	No entry content, because the target was not found.
						titleLineHTML = renderTitleLinkHTML(articleLink.href, pageTitleHTML);
					} else if (/H[0-9]/.test(targetElement.tagName)) {
						//	The target is a section heading.
						let targetHeading = targetElement;

						//	The id is on the heading, so the section is its parent.
						let targetSection = targetHeading.parentElement.cloneNode(true);

						//	Excise heading.
						targetHeading = targetSection.firstElementChild;
						targetHeading.remove();

						//	Unwrap or delete links, but save them for inclusion in the template.
						//	First link is the section title itself.
						targetHeading.querySelectorAll("a:first-of-type").forEach(link => {
							//  Process link, save HTML, unwrap.
							Content.contentTypes.wikipediaEntry.qualifyWikipediaLink(link, articleLink);
							Content.contentTypes.wikipediaEntry.designateWikiLink(link);
							secondaryTitleLinksHTML += link.outerHTML;
							unwrap(link);
						});
						//	Additional links are other things, who knows what.
						targetHeading.querySelectorAll("a").forEach(link => {
							//  Process link, save HTML, delete.
							Content.contentTypes.wikipediaEntry.qualifyWikipediaLink(link, articleLink);
							Content.contentTypes.wikipediaEntry.designateWikiLink(link);
							secondaryTitleLinksHTML += link.outerHTML;
							link.remove();
						});
						if (secondaryTitleLinksHTML > "")
							secondaryTitleLinksHTML = ` (${secondaryTitleLinksHTML})`;

						/*	Full article link (transformed), plus live section
							link with cleaned title text. (We will attach the
							secondary title links, if any, later.)
						 */
						titleLineHTML = renderTitleLinkHTML(modifiedURL(articleLink, { hash: "" }).href, pageTitleHTML, true)
									  + " &#x00a7; " // ‘§’
									  + renderTitleLinkHTML(articleLink.href, targetHeading.innerHTML);

						/*	Content sans heading, with TOC (if there are any
							subsections).
						 */
						let entryContentDoc = newDocument(targetSection.innerHTML);
						entryContentDoc.insertBefore(newDocument(buildArticleTOC(entryContentDoc.querySelectorAll("section"))),
													 entryContentDoc.querySelector("section"));
						entryContentHTML = entryContentDoc.innerHTML;

						//	Designate content type.
						contentTypeClass += " wikipedia-section";
					} else {
						//	The target is something else.
						titleLineHTML = renderTitleLinkHTML(articleLink.href, `${articleLink.hash} (${pageTitleHTML})`);
						entryContentHTML = Transclude.blockContext(targetElement, articleLink).innerHTML;
					}
				} else {
					titleLineHTML = renderTitleLinkHTML(articleLink.href, pageTitleHTML);
					entryContentHTML = wikipediaEntryContent.document.querySelector("[data-mw-section-id='0']").innerHTML
									 + buildArticleTOC(Array.from(wikipediaEntryContent.document.querySelectorAll("section")).slice(1));
				}

				//	Document fragment, for entry content post-processing.
				let contentDocument = newDocument(entryContentHTML);

				//	Post-process entry content.
				Content.contentTypes.wikipediaEntry.postProcessEntryContent(contentDocument, articleLink);

				//	Request image inversion judgments from invertOrNot.
				requestImageInversionJudgmentsForImagesInContainer(contentDocument);

				//	Request image outlining judgments from outlineOrNot.
				requestImageOutliningJudgmentsForImagesInContainer(contentDocument);

				//	Pull out initial figure (thumbnail).
				if (GW.mediaQueries.mobileWidth.matches == false) {
					let initialFigure = contentDocument.querySelector("figure.float-right:first-child");
					if (initialFigure) {
						thumbnailFigureHTML = initialFigure.outerHTML;
						initialFigure.remove();
					}
				}

				//	Entry content, after processing.
				entryContentHTML = contentDocument.innerHTML;

				//	Pop-frame title text and link.
				popFrameTitle = newElement("SPAN", null, { innerHTML: titleLineHTML });
				popFrameTitleLinkHref = articleLink.href;

				//	Attach secondary links (if any) to title line.
				titleLineHTML += secondaryTitleLinksHTML;

				return {
					content: {
						titleLine:                  titleLineHTML,
						entryContent:               entryContentHTML,
						thumbnailFigure:            thumbnailFigureHTML
					},
					contentTypeClass:               contentTypeClass,
					template:                       "wikipedia-entry-blockquote-inside",
					popFrameTemplate:               "wikipedia-entry-blockquote-not",
					popFrameTitle:                  popFrameTitle.textContent,
					popFrameTitleLinkHref:          popFrameTitleLinkHref,
					annotationFileIncludeTemplate:  "wikipedia-entry-blockquote-title-not"
				};
			},

			additionalAPIRequestHeaders: {
				"Accept": 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/2.1.0"'
			},

			/*	Qualify a link in a Wikipedia article.
			 */
			qualifyWikipediaLink: (link, hostArticleLink) => {
				if (link.getAttribute("href") == null)
					return;

				//  Qualify link.
				if (link.matches([
						"a[rel='mw:WikiLink']",
						"a[rel='mw:referencedBy']",
						"span[rel='mw:referencedBy'] a",
						"sup.mw-ref a",
						].join(", ")))
					link.pathname = "/wiki" + link.getAttribute("href").slice(1);
				if (link.getAttribute("href").startsWith("#"))
					link.pathname = hostArticleLink.pathname;
				if (link.hostname == location.hostname)
					link.hostname = hostArticleLink.hostname;
				if (   link.hostname == hostArticleLink.hostname
					&& link.pathname.startsWith("/wiki/") == false
					&& link.pathname.startsWith("/api/") == false)
					link.pathname = "/wiki" + link.pathname;
			},

			/*	Mark a wiki-link appropriately, as annotated, or live, or neither.
			 */
			designateWikiLink: (link) => {
				if (/(.+?)\.wikipedia\.org/.test(link.hostname)) {
					if (Content.contentTypes.wikipediaEntry.matches(link)) {
						link.classList.add("content-transform");
					} else {
						if ((   link.pathname.startsWith("/wiki/Special:")
							 || link.pathname == "/w/index.php"
							 ) == false)
							link.classList.add("link-live");
					}
				}
			},

			/*  Elements to excise from a Wikipedia entry.
			 */
			extraneousElementSelectors: [
				"style",
		// 		".mw-ref",
				".shortdescription",
				"td hr",
				".hatnote",
				".portal",
				".penicon",
		// 		".reference",
				".Template-Fact",
				".error",
				".mwe-math-mathml-inline",
				".mwe-math-mathml-display",
				".sidebar",
				".ambox",
				".unicode.haudio",
		// 		"span[typeof='mw:File']",
				"link",
				"span[typeof='mw:FallbackId']"
			],

			/*  CSS properties to preserve when stripping inline styles.
			 */
			preservedInlineStyleProperties: [
				"display",
				"position",
				"top",
				"left",
				"bottom",
				"right",
				"width",
				"height",
				"word-break"
			],

			/*  Post-process an already-constructed content-transformed
				Wikipedia entry (do HTML cleanup, etc.).
			 */
			postProcessEntryContent: (contentDocument, articleLink) => {
				//  Remove unwanted elements.
				contentDocument.querySelectorAll(Content.contentTypes.wikipediaEntry.extraneousElementSelectors.join(", ")).forEach(element => {
					element.remove();
				});

				//	Clean empty nodes.
				contentDocument.childNodes.forEach(node => {
					if (isNodeEmpty(node))
						node.remove();
				});

				//  Remove location maps (they don’t work right).
				contentDocument.querySelectorAll(".locmap").forEach(locmap => {
					(locmap.closest("tr") ?? locmap).remove();
				});

				//	Remove other maps.
				contentDocument.querySelectorAll("img").forEach(image => {
					let imageSourceURL = URLFromString(image.src);
					if (imageSourceURL.hostname == "maps.wikimedia.org")
						image.remove();
				});

				//  Remove empty paragraphs.
				contentDocument.querySelectorAll("p:empty").forEach(emptyGraf => {
					emptyGraf.remove();
				});

				//	Remove edit-links.
				contentDocument.querySelectorAll("a[title^='Edit this on Wiki'], a[title^='Edit this at Wiki']").forEach(editLink => {
					editLink.remove();
				});

				//	Remove GPS coordinates.
				contentDocument.querySelectorAll(".geo-inline-hidden").forEach(gpsCoords => {
					let containingGraf = gpsCoords.closest("p");
					gpsCoords.remove();
					if (containingGraf.textContent.trim() == "")
						containingGraf.remove();
				});

				//  Process links.
				contentDocument.querySelectorAll("a").forEach(link => {
					//	De-linkify non-anchor self-links.
					if (   link.hash     == ""
						&& link.pathname == articleLink.pathname) {
						unwrap(link);
						return;
					}

					//  Qualify links.
					Content.contentTypes.wikipediaEntry.qualifyWikipediaLink(link, articleLink);

					//  Mark other Wikipedia links as also being annotated.
					Content.contentTypes.wikipediaEntry.designateWikiLink(link);

					//  Mark self-links (anchorlinks within the same article).
					if (link.pathname == articleLink.pathname)
						link.classList.add("link-self");
				});

				//	Prevent layout weirdness for footnote links.
				contentDocument.querySelectorAll("a[href*='#cite_note-']").forEach(citationLink => {
					citationLink.classList.add("icon-not");
					citationLink.innerHTML = "&NoBreak;" + citationLink.textContent.trim();
				});

				//	Rectify back-to-citation links in “References” sections.
				contentDocument.querySelectorAll("a[rel='mw:referencedBy']").forEach(backToCitationLink => {
					backToCitationLink.classList.add("icon-not");
					backToCitationLink.classList.add("wp-footnote-back");
					backToCitationLink.innerHTML = backToCitationLink.textContent.trim();
				});

				//	Strip inline styles and some related attributes.
				let tableElementsSelector = "table, thead, tfoot, tbody, tr, th, td";
				contentDocument.querySelectorAll("[style]").forEach(styledElement => {
					//	Skip table elements; we handle those specially.
					if (styledElement.matches(tableElementsSelector))
						return;

					if (styledElement.style.display != "none")
						stripStyles(styledElement, { saveProperties: Content.contentTypes.wikipediaEntry.preservedInlineStyleProperties });
				});
				//	Special handling for table elements.
				contentDocument.querySelectorAll(tableElementsSelector).forEach(tableElement => {
					if (tableElement.style.display != "none") {
						if (tableElement.style.position == "relative")
							stripStyles(tableElement, { saveProperties: [ "text-align", "position", "width", "height" ] });
						else
							stripStyles(tableElement, { saveProperties: [ "text-align" ] });
					}

					[ "width", "height", "align" ].forEach(attribute => {
						tableElement.removeAttribute(attribute);
					});
				});

				//  Rectify table classes.
				contentDocument.querySelectorAll("table.sidebar").forEach(table => {
					table.classList.toggle("infobox", true);
				});

				//  Normalize table cell types.
				contentDocument.querySelectorAll("th:not(:only-child)").forEach(cell => {
					let rowSpan = (cell.rowSpan > 1) ? ` rowspan="${cell.rowSpan}"` : ``;
					let colSpan = (cell.colSpan > 1) ? ` colspan="${cell.colSpan}"` : ``;
					cell.outerHTML = `<td${rowSpan}${colSpan}>${cell.innerHTML}</td>`;
				});

				//  Un-linkify images.
				contentDocument.querySelectorAll("a img").forEach(linkedImage => {
					let enclosingLink = linkedImage.closest("a");
					enclosingLink.parentElement.replaceChild(linkedImage, enclosingLink);
				});

				//	Fix chemical formulas.
				contentDocument.querySelectorAll(".chemf br").forEach(br => {
					br.remove();
				});

				//	Rectify quoteboxes.
				contentDocument.querySelectorAll("div.quotebox").forEach(quotebox => {
					let blockquote = quotebox.querySelector("blockquote");
					blockquote.classList.add("quotebox");

					let title = quotebox.querySelector(".quotebox-title");
					if (title) {
						blockquote.insertBefore(title, blockquote.firstElementChild);
					}

					let cite = quotebox.querySelector("blockquote + p");
					if (cite) {
						blockquote.insertBefore(cite, null);
						cite.classList.add("quotebox-citation");
					}

					unwrap(quotebox);
				});

				//  Separate out the thumbnail and float it.
				let thumbnail = contentDocument.querySelector("img");
				let thumbnailContainer;
				if (thumbnail)
					thumbnailContainer = thumbnail.closest(".infobox-image, .thumb");
				if (   thumbnail
					&& thumbnailContainer
					&& thumbnailContainer.closest(".gallery") == null) {
					while ([ "TR", "TD", "TH" ].includes(thumbnailContainer.tagName))
						thumbnailContainer = thumbnailContainer.parentElement;

					//  Create the figure and move the thumbnail(s) into it.
					let figure = newElement("FIGURE", { "class": "thumbnail float-right" });
					thumbnailContainer.querySelectorAll(".infobox-image img, .thumb img").forEach(image => {
						if (image.closest("figure") == figure)
							return;

						let closestRow = image.closest("tr, .trow, [style*='display: table-row']");
						if (closestRow == null)
							return;

						let allImagesInRow = closestRow.querySelectorAll("img");
						if (allImagesInRow.length > 1) {
							let rowWrapper = newElement("SPAN", { "class": "image-row-wrapper" });
							rowWrapper.append(...allImagesInRow);
							figure.append(rowWrapper);
						} else {
							figure.append(allImagesInRow[0]);
						}

						closestRow.remove();
					});

					//  Create the caption, if need be.
					let caption = contentDocument.querySelector(".mw-default-size + div, .infobox-caption, .thumbcaption");
					if (   caption
						&& caption.textContent > "") {
						figure.appendChild(newElement("FIGCAPTION", null, { "innerHTML": caption.innerHTML }));

						let closestRow = caption.closest("tr, .trow, [style*='display: table-row']");
						if (closestRow)
							closestRow.remove();
					}

					//  Insert the figure as the first child of the entry.
					contentDocument.insertBefore(figure, contentDocument.firstElementChild);

					//  Rectify classes.
					thumbnailContainer.closest("table")?.classList.toggle("infobox", true);
				} else if (   thumbnail
						   && thumbnail.closest("figure")) {
					let figure = thumbnail.closest("figure");

					//  Insert the figure as the first child of the entry.
					contentDocument.insertBefore(figure, contentDocument.firstElementChild);
					figure.classList.add("thumbnail", "float-right");

					let caption = figure.querySelector("figcaption");
					if (caption.textContent == "")
						caption.remove();
				}

				//	Rewrite other figures.
				contentDocument.querySelectorAll("div.thumb").forEach(figureBlock => {
					let figure = newElement("FIGURE");

					let images = figureBlock.querySelectorAll("img");
					if (images.length == 0)
						return;

					images.forEach(image => {
						figure.appendChild(image);
					});

					let captionHTML = (   figureBlock.querySelector(".thumbcaption")
									   ?? figureBlock.closest(".gallerybox").querySelector(".gallerytext")
									   )?.innerHTML;
					if (captionHTML)
						figure.appendChild(newElement("FIGCAPTION", null, { innerHTML: captionHTML }));

					figureBlock.parentNode.insertBefore(figure, figureBlock);
					figureBlock.parentNode.querySelector(".gallerytext")?.remove();
					figureBlock.remove();
				});

				//	Float all figures right.
				contentDocument.querySelectorAll("figure").forEach(figure => {
					//	“Gallery” blocks are excepted.
					if (figure.closest(".gallery"))
						return;

					figure.classList.add("float-right");
				});

				//	Mark certain images as not to be wrapped in figures.
				let noFigureImagesSelector = [
					".mwe-math-element",
					".mw-default-size",
					".sister-logo",
					".side-box-image",
					"p"
				].map(selector => `${selector} img`).join(", ");
				contentDocument.querySelectorAll(noFigureImagesSelector).forEach(image => {
					image.classList.add("figure-not");
				});

				//	Clean up math elements.
				unwrapAll(".mwe-math-element", { root: contentDocument });
				contentDocument.querySelectorAll("dl dd .mwe-math-fallback-image-inline").forEach(inlineButReallyBlockMathElement => {
					//	Unwrap the <dd>.
					unwrap(inlineButReallyBlockMathElement.parentElement);
					//	Unwrap the <dl>.
					unwrap(inlineButReallyBlockMathElement.parentElement);
					//	Rectify class.
					inlineButReallyBlockMathElement.swapClasses([ "mwe-math-fallback-image-inline", "mwe-math-fallback-image-display" ], 1);
				});
				wrapAll(".mwe-math-fallback-image-display", "div.wikipedia-math-wrapper.wikipedia-math-block-wrapper", { root: contentDocument });
				wrapAll(".mwe-math-fallback-image-inline", "span.wikipedia-math-wrapper.wikipedia-math-inline-wrapper", { root: contentDocument });
				contentDocument.querySelectorAll(".wikipedia-math-wrapper img").forEach(mathImage => {
					mathImage.classList.add("invert-auto", "dark-mode-invert", "drop-filter-on-hover-not");
				});

				//	Move infoboxes out of the way.
				let childElements = Array.from(contentDocument.children);
				let firstInfoboxIndex = childElements.findIndex(x => x.matches(".infobox"));
				if (firstInfoboxIndex !== -1) {
					let firstInfobox = childElements[firstInfoboxIndex];
					let firstGrafAfterInfobox = childElements.slice(firstInfoboxIndex).find(x => x.matches("p"));
					if (firstGrafAfterInfobox)
						contentDocument.insertBefore(firstGrafAfterInfobox, firstInfobox);
					wrapElement(firstInfobox, ".collapse");
				}

				//	Apply section classes.
				contentDocument.querySelectorAll("section").forEach(section => {
					if (/[Hh][1-9]/.test(section.firstElementChild.tagName))
						section.classList.add("level" + section.firstElementChild.tagName.slice(1));
				});

				//	Paragraphize note-boxes, if any (e.g., disambiguation notes).
				contentDocument.querySelectorAll(".dmbox-body").forEach(noteBox => {
					paragraphizeTextNodesOfElementRetainingMetadata(noteBox);
					noteBox.parentElement.classList.add("admonition", "tip");
				});

				//	Clean empty nodes, redux.
				contentDocument.childNodes.forEach(node => {
					if (isNodeEmpty(node))
						node.remove();
				});
			}
		},

		githubIssue: {
			matches: (link) => {
				return (   link.classList?.contains("content-transform-not") != true
						&& /github\.com/.test(link.hostname) == true
						&& /\/.+?\/.+?\/issues\/[0-9]+$/.test(link.pathname) == true);
			},

			isSliceable: false,

			contentCacheKeyForLink: (link) => {
				return link.href;
			},

			sourceURLsForLink: (link) => {
				let apiRequestURL = URLFromString(link.href);

				apiRequestURL.hostname = "api.github.com";
				apiRequestURL.pathname = "/repos" + apiRequestURL.pathname;
				apiRequestURL.hash = "";

				return [ apiRequestURL ];
			},

            contentFromResponse: (response, link, sourceURL) => {
                return {
                    document: newDocument(JSON.parse(response)["body_html"])
                };
            },

			referenceDataCacheKeyForLink: (link) => {
				return link.href;
			},

			referenceDataFromContent: (issueContent, link) => {
				return {
                    content: {
                    	issueContent:       issueContent.document.innerHTML
                    },
                    contentTypeClass:       "github-issue",
                    template:               "github-issue-blockquote-outside",
					popFrameTemplate:       "github-issue-blockquote-not",
                    popFrameTitle:          null,
                    popFrameTitleLinkHref:  null,
                };
			},

			additionalAPIRequestHeaders: {
				"Accept": "application/vnd.github.html+json",
				"X-GitHub-Api-Version": "2022-11-28"
			}
		},

        tweet: {
            matches: (link) => {
                return (   link.classList?.contains("content-transform-not") != true
						&& [ "x.com" ].includes(link.hostname) == true
                        && link.pathname.match(/\/.+?\/status\/[0-9]+$/) != null
                        && link.dataset?.urlArchive != null);
            },

            isSliceable: false,

			contentCacheKeyForLink: (link) => {
				return link.href;
			},

            sourceURLsForLink: (link) => {
                let urls = [ ];

                if (link.dataset.urlArchive)
                    urls.push(URLFromString(link.dataset.urlArchive));

				return urls;
            },

            contentFromResponse: (response, link, sourceURL) => {
                return {
                    document: newDocument(response)
                };
            },

			referenceDataCacheKeyForLink: (link) => {
				return link.href;
			},

            referenceDataFromContent: (tweetContent, link) => {
            	//	Nitter host.
                let nitterHost = Content.contentTypes.tweet.getNitterHost();

                //  Class and link icon for link to user’s page.
                let authorLinkClass = "author-link";
                let authorLinkIconMetadata = `data-link-icon-type="svg" data-link-icon="twitter"`;

                //  URL for link to user’s page.
                let authorLinkURL = URLFromString(tweetContent.document.querySelector(".main-tweet a.username").href);
                authorLinkURL.hostname = nitterHost;
                let authorLinkHref = authorLinkURL.href;

                //  Avatar.
                let avatarImgElement = tweetContent.document.querySelector(".main-tweet img.avatar").cloneNode(true);
                let avatarImgSrc = avatarImgElement.getAttribute("src");
                if (avatarImgSrc.startsWith("data:image/svg+xml")) {
                    avatarImgElement.setAttribute("style", avatarImgElement.getAttribute("style")
                                                           + ";"
                                                           + tweetContent.document.querySelector("style").innerHTML.match(/:root\{(.+?)\}/)[1]);
                    let avatarImgSrcVar = avatarImgElement.style.getPropertyValue("background-image").match(/var\((.+?)\)/)[1];
                    avatarImgSrc = avatarImgElement.style.getPropertyValue(avatarImgSrcVar).match(/url\("(.+?)"\)/)[1];
                }
                let avatarImg = newElement("IMG", { src: avatarImgSrc, class: "avatar figure-not" });

                //  Text of link to user’s page.
                let authorLinkParts = tweetContent.document.querySelector("title").textContent.match(/^(.+?) \((@.+?)\):/);
                let authorPlusAvatarHTML = `${avatarImg.outerHTML}“${authorLinkParts[1]}” (<code>${authorLinkParts[2]}</code>)`;

				//	Class and link icon for link to tweet.
                let tweetLinkClass = "tweet-link" + (link.dataset.urlArchive ? " link-live" : "");
                let tweetLinkIconMetadata = authorLinkIconMetadata;

                //  URL for link to tweet.
                let tweetLinkURL = URLFromString(link.href);
                tweetLinkURL.hostname = nitterHost;
                tweetLinkURL.hash = "m";

				//	Data attribute for archived tweet (if available).
                let archivedTweetURLDataAttribute = link.dataset.urlArchive
                									? `data-url-archive="${(URLFromString(link.dataset.urlArchive).href)}"`
                									: "";
				//	Text of link to tweet.
                let tweetDate = new Date(Date.parse(tweetContent.document.querySelector(".main-tweet .tweet-date").textContent));
                let tweetDateString = ("" + tweetDate.getFullYear())
                                    + "-"
                                    + ("" + tweetDate.getMonth()).padStart(2, '0')
                                    + "-"
                                    + ("" + tweetDate.getDate()).padStart(2, '0');

                //  Main tweet content.
                let tweetContentHTML = tweetContent.document.querySelector(".main-tweet .tweet-content").innerHTML.split("\n\n").map(graf => `<p>${graf}</p>`).join("\n");

                //  Attached media (video or images).
                tweetContentHTML += Content.contentTypes.tweet.mediaEmbedHTML(tweetContent.document);

				//	Temporary document fragment.
				let tweetContentDocument = newDocument(tweetContentHTML);

				//	Request image inversion judgments from invertOrNot.
				requestImageInversionJudgmentsForImagesInContainer(tweetContentDocument);

				//	Request image outlining judgments from outlineOrNot.
				requestImageOutliningJudgmentsForImagesInContainer(tweetContentDocument);

                //  Pop-frame title text.
                let popFrameTitleText = `${authorPlusAvatarHTML} on ${tweetDateString}`;

                return {
                    content: {
                        authorLinkClass:                authorLinkClass,
                        authorLinkHref:                 authorLinkURL.href,
                        authorLinkIconMetadata:         authorLinkIconMetadata,
                        authorPlusAvatar:               authorPlusAvatarHTML,
                        tweetLinkClass:                 tweetLinkClass,
                        tweetLinkHref:                  tweetLinkURL.href,
                        tweetLinkIconMetadata:          tweetLinkIconMetadata,
                        archivedTweetURLDataAttribute:  archivedTweetURLDataAttribute,
                        tweetDate:                      tweetDateString,
                        tweetContent:                   tweetContentHTML
                    },
                    contentTypeClass:       "tweet",
                    template:               "tweet-blockquote-outside",
					popFrameTemplate:       "tweet-blockquote-not",
                    popFrameTitle:          popFrameTitleText,
                    popFrameTitleLinkHref:  tweetLinkURL.href,
                };
            },

            mediaURLFromMetaTag: (mediaMetaTag, nitterHost) => {
                let mediaURL = URLFromString(mediaMetaTag.content);
                mediaURL.hostname = nitterHost;
                return mediaURL;
            },

            mediaEmbedHTML: (tweetDoc) => {
                let attachments = tweetDoc.querySelector(".main-tweet .attachments");
                if (attachments) {
                    let mediaHTML = ``;
                    attachments.querySelectorAll("img, video").forEach(mediaElement => {
                        mediaHTML += `<figure>${mediaElement.outerHTML}</figure>`;
                    });

                    return mediaHTML;
                } else {
                    return "";
                }
            },

            liveNitterHosts: [
                "nitter.poast.org"
            ],

            getNitterHost: () => {
                let hosts = Content.contentTypes.tweet.liveNitterHosts;
                return hosts[rollDie(hosts.length) - 1];
            }
        },

        localCodeFile: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                //  Maybe it’s an aux-links link?
                if (link.pathname.startsWith("/metadata/") == true)
                    return false;

                //  Maybe it’s a local document link?
                if (   link.pathname.startsWith("/doc/www/") == true
                    || (   link.pathname.startsWith("/doc/") == true
                        && link.pathname.match(/\.(html|pdf)$/i) != null))
                    return false;

                return link.pathname.endsWithAnyOf(Content.contentTypes.localCodeFile.codeFileExtensions.map(x => `.${x}`));
            },

            isSliceable: false,

            /*  We first try to retrieve a syntax-highlighted version of the
                given code file, stored on the server as an HTML fragment. If
                present, we embed that. If there’s no such fragment, then we
                just embed the contents of the actual code file, in a
                <pre>-wrapped <code> element.
             */
            sourceURLsForLink: (link) => {
                let codeFileURL = URLFromString(link.href);
                codeFileURL.hash = "";
                codeFileURL.search = "";

                let syntaxHighlightedCodeFileURL = URLFromString(codeFileURL.href);
                syntaxHighlightedCodeFileURL.pathname += ".html";

                return [ syntaxHighlightedCodeFileURL, codeFileURL ];
            },

            contentFromResponse: (response, link, sourceURL) => {
                let contentDocument;

                //  Parse (encoding and wrapping first, if need be).
                if (sourceURL.pathname == link.pathname + ".html") {
                    //  Syntax-highlighted code (already HTML-encoded).
                    contentDocument = newDocument(response);

                    //  We want <body> contents only, no metadata and such.
                    let nodes = Array.from(contentDocument.childNodes);
                    let codeWrapper = contentDocument.querySelector("div.sourceCode");
                    contentDocument.replaceChildren(...(nodes.slice(nodes.indexOf(codeWrapper))));

                    //  Handle truncated syntax-highlighted code files.
                    if (codeWrapper.nextElementSibling?.tagName == "P") {
                        codeWrapper.classList.add("truncated");

                        let truncationNotice = codeWrapper.nextElementSibling;
                        truncationNotice.classList.add("truncation-notice");
                        truncationNotice.querySelector("a").classList.add("extract-not");

                        codeWrapper.append(truncationNotice);
                    }

                    //  Set ‘line’ class and fix blank lines.
                    Array.from(contentDocument.querySelector("code").children).forEach(lineSpan => {
                        lineSpan.classList.add("line");
                        if (lineSpan.innerHTML.length == 0)
                            lineSpan.innerHTML = "&nbsp;";
                    });
                } else {
                    //  “Raw” code.
                    let htmlEncodedResponse = response.replace(
                        /[<>]/g,
                        c => ('&#' + c.charCodeAt(0) + ';')
                    ).split("\n").map(
                        line => (`<span class="line">${(line || "&nbsp;")}</span>`)
                    ).join("\n");
                    contentDocument = newDocument(  `<div class="sourceCode">`
                                          + `<pre class="raw-code"><code>`
                                          + htmlEncodedResponse
                                          + `</code></pre>`
                                          + `</div>`);
                }

                return {
                	document: contentDocument
                };
            },

            codeFileExtensions: [
                //  Truncated at 2000 lines for preview.
                "bash", "c", "conf", "css", "diff", "hs", "html", "js",
                "json", "jsonl", "md", "opml", "patch", "php", "py", "R",
                "sh", "xml",
                //  Non-syntax highlighted (due to lack of known format), but truncated:
                "txt"
            ]
        },

        localFragment: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                return (   link.pathname.startsWith("/metadata/") == true
                        && link.pathname.endsWith(".html") == true);
            },

            isSliceable: true,

            sourceURLsForLink: (link) => {
                let url = URLFromString(link.href);
                url.hash = "";
                url.search = "";

                return [ url ];
            },

            contentFromResponse: (response, link, sourceURL) => {
                let contentDocument = newDocument(response);

                let auxLinksLinkType = AuxLinks.auxLinksLinkType(sourceURL);
                if (auxLinksLinkType) {
                    let auxLinksList = contentDocument.querySelector("ul, ol");
                    if (auxLinksList) {
                        auxLinksList.classList.add("aux-links-list", auxLinksLinkType + "-list");
                        auxLinksList.previousElementSibling.classList.add("aux-links-list-label", auxLinksLinkType + "-list-label");

                        if (auxLinksLinkType == "backlinks") {
                            auxLinksList.querySelectorAll("blockquote").forEach(blockquote => {
                                blockquote.classList.add("backlink-context");
                            });
                            auxLinksList.querySelectorAll("li > p").forEach(p => {
                                p.classList.add("backlink-source");
                            });
                            auxLinksList.querySelectorAll(".backlink-source a:nth-of-type(2), .backlink-context a").forEach(auxLink => {
                                auxLink.dataset.backlinkTargetUrl = AuxLinks.targetOfAuxLinksLink(sourceURL);
                            });
                        } else if (auxLinksLinkType == "link-bibliography") {
                        	auxLinksList.querySelectorAll("ol ol").forEach(linkBibSubSection => {
                        		linkBibSubSection.setAttribute("type", "α");
                        	});
                        }
                    }
                }

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.localFragment.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: sourceURL
                });

                return {
                	document: contentDocument
                };
            },

            permittedContentTypes: [ "text/html" ]
        },

        remoteImage: {
            matches: (link) => {
                if (Content.contentTypes.remoteImage.isWikimediaUploadsImageLink(link)) {
                    return true;
                } else {
                    return false;
                }
            },

            isSliceable: true,

            contentFromLink: (link) => {
                if ((Content.contentTypes.remoteImage.isWikimediaUploadsImageLink(link)) == false)
                    return null;

                //  Use annotation abstract (if any) as figure caption.
                let caption = Content.figcaptionHTMLForMediaLink(link);

                /*  Note that we pass in the original link’s classes; this
                    is good for classes like ‘invert’, ‘width-full’, etc.
                 */
                let contentDocument = newDocument(`<figure><img
                											class="${link.classList}"
                											src="${link.href}"
                											loading="eager"
                											decoding="sync"
                											>${caption}</figure>`);

                //  Remove extraneous classes.
                Content.removeExtraneousClassesFromMediaElement(contentDocument.querySelector("img"));

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.remoteImage.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: new URL(link.href)
                });

                return {
                	document: contentDocument
                };
            },

            isWikimediaUploadsImageLink: (link) => {
                return (   link.hostname == "upload.wikimedia.org"
                        && link.pathname.endsWithAnyOf(Content.contentTypes.localImage.imageFileExtensions.map(x => `.${x}`)));
            }
        },

        remoteVideo: {
            matches: (link) => {
                if (Content.contentTypes.remoteVideo.isYoutubeLink(link)) {
                    return (Content.contentTypes.remoteVideo.youtubeId(link) != null);
                } else if (Content.contentTypes.remoteVideo.isVimeoLink(link)) {
                    return (Content.contentTypes.remoteVideo.vimeoId(link) != null);
                } else {
                    return false;
                }
            },

            isSliceable: true,

            contentFromLink: (link) => {
                let contentDocument = null;

                if (Content.contentTypes.remoteVideo.isYoutubeLink(link)) {
                    let videoId = Content.contentTypes.remoteVideo.youtubeId(link);
                    let videoEmbedURL = URLFromString(`https://www.youtube.com/embed/${videoId}`);
                    if (link.search > "") {
                        videoEmbedURL.search = link.search;

						videoEmbedURL.deleteQueryVariable("v");

                        let startTime = videoEmbedURL.getQueryVariable("t");
                        if (startTime) {
	                        videoEmbedURL.setQueryVariable("start", startTime.slice(0, -1));
	                        videoEmbedURL.deleteQueryVariable("t");
	                    }
                    }
                    videoEmbedURL.setQueryVariable("autoplay", "1");

                    let srcdocStyles =
                          `<style>`
                        + `* { padding: 0; margin: 0; overflow: hidden; } `
                        + `html, body { height: 100%; } `
                        + `img, span { position: absolute; width: 100%; top: 0; bottom: 0; margin: auto; } `
                        + `span { height: 1.5em; text-align: center; font: 48px/1.5 sans-serif; color: white; text-shadow: 0 0 0.5em black; }`
                        + `</style>`;
                    let placeholderImgSrc = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    let playButtonHTML = `<span class='video-embed-play-button'>&#x25BA;</span>`;
                    let srcdocHTML = `<a href='${videoEmbedURL.href}'><img src='${placeholderImgSrc}'>${playButtonHTML}</a>`;

                    //  `allow-same-origin` only for EXTERNAL videos, NOT local videos!
                    contentDocument = newDocument(Content.objectHTMLForURL(videoEmbedURL, {
                        additionalClasses: "youtube",
                        additionalAttributes: `srcdoc="${srcdocStyles}${srcdocHTML}"
                        					   allow="autoplay; fullscreen"
                        					   sandbox="allow-scripts allow-same-origin allow-presentation"
                        					   allowfullscreen`
                    }));
                } else if (Content.contentTypes.remoteVideo.isVimeoLink(link)) {
                    let videoId = Content.contentTypes.remoteVideo.vimeoId(link);
                    let videoEmbedURL = URLFromString(`https://player.vimeo.com/video/${videoId}`);
                    if (link.search > "")
                        videoEmbedURL.search = link.search;

                    contentDocument = newDocument(Content.objectHTMLForURL(videoEmbedURL, {
                        additionalClasses: "vimeo",
                        additionalAttributes: `allow="autoplay; fullscreen; picture-in-picture" allowfullscreen`
                    }));
                }

                return {
                	document: contentDocument
                };
            },

            isYoutubeLink: (link) => {
                return [ "www.youtube.com", "youtube.com", "youtu.be" ].includes(link.hostname);
            },

            youtubeId: (url) => {
                let match = url.href.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
                if (   match
                    && match.length == 3
                    && match[2].length == 11) {
                    return match[2];
                } else {
                    return null;
                }
            },

            isVimeoLink: (link) => {
                return [ "vimeo.com" ].includes(link.hostname);
            },

            vimeoId: (url) => {
                let match = url.pathname.match(/^\/([0-9]+)$/);
                if (   match
                    && match.length == 2) {
                    return match[1];
                } else {
                    return null;
                }
            }
        },

        localDocument: {
            matches: (link) => {
                //  Some local-document links are handled specially.
                if ([ "tweet"
                      ].findIndex(x => Content.contentTypes[x].matches(link)) !== -1)
                    return false;

                //  Account for alternate and archive URLs.
                let url = URLFromString(link.dataset?.urlArchive ?? link.dataset?.urlIframe ?? link.href);

                //  Maybe it’s a foreign link?
                if (url.hostname != location.hostname)
                    return false;

                //  On mobile, we cannot embed PDFs.
                if (   GW.isMobile()
                    && url.pathname.endsWith(".pdf") == true)
                    return false;

                return (   url.pathname.startsWith("/metadata/") == false
                        && url.pathname.endsWithAnyOf(Content.contentTypes.localDocument.documentFileExtensions.map(x => `.${x}`)) == true);
            },

            isSliceable: false,

            contentFromLink: (link) => {
                let embedSrc = link.dataset.urlArchive ?? link.dataset.urlIframe ?? link.href;
                let additionalAttributes = [ ];

                //  Determine sandbox settings.
                let embedURL = URLFromString(embedSrc);
                if (embedURL.pathname.startsWith("/static/") == true) {
                	additionalAttributes.push(`sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`);
                } else if (embedURL.pathname.endsWith(".pdf") == false) {
                    additionalAttributes.push(`sandbox="allow-same-origin" referrerpolicy="same-origin"`);
                }

                let contentDocument = newDocument(Content.objectHTMLForURL(embedSrc, {
                    additionalAttributes: additionalAttributes.join(" ")
                }));

				return {
                	document: contentDocument
                };
            },

            documentFileExtensions: [ "html", "pdf", "csv", "doc", "docx", "ods", "xls", "xlsx" ]
        },

        localVideo: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                return link.pathname.endsWithAnyOf(Content.contentTypes.localVideo.videoFileExtensions.map(x => `.${x}`));
            },

            isSliceable: true,

            contentFromLink: (link) => {
                //  Import specified dimensions / aspect ratio.
                let dimensions = Content.mediaDimensionsHTMLForMediaLink(link);

                //  Determine video type and poster pathname.
                let videoFileExtension = /\.(\w+?)$/.exec(link.pathname)[1];
                let posterPathname = link.pathname + "-poster.jpg";

                //  Use annotation abstract (if any) as figure caption.
                let caption = Content.figcaptionHTMLForMediaLink(link);

                /*  Note that we pass in the original link’s classes; this
                    is good for classes like ‘invert’, ‘width-full’, etc.
                 */
                let contentDocument = newDocument(`<figure><video
                											${dimensions}
                											class="${link.classList}"
                											controls="controls"
                											preload="none"
                											data-video-poster="${posterPathname}"
                											>`
                										+ `<source
                											src="${link.href}"
                											type="video/${videoFileExtension}"
                											>`
                										+ `</video>${caption}</figure>`);

                //  Remove extraneous classes.
                Content.removeExtraneousClassesFromMediaElement(contentDocument.querySelector("video"));

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.localVideo.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: new URL(link.href)
                });

                return {
                	document: contentDocument
                };
            },

            videoFileExtensions: [ "mp4", "webm" ]
        },

        localAudio: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                return link.pathname.endsWithAnyOf(Content.contentTypes.localAudio.audioFileExtensions.map(x => `.${x}`));
            },

            isSliceable: true,

            contentFromLink: (link) => {
                //  Use annotation abstract (if any) as figure caption.
                let caption = Content.figcaptionHTMLForMediaLink(link);

                /*  Note that we pass in the original link’s classes; this
                    is good for classes like ‘invert’, ‘width-full’, etc.
                 */
                let contentDocument = newDocument(`<figure><audio
                											class="${link.classList}"
                											controls="controls"
                											preload="none"
                											>`
                										+ `<source src="${link.href}">`
                										+ `</audio>${caption}</figure>`);

                //  Remove extraneous classes.
                Content.removeExtraneousClassesFromMediaElement(contentDocument.querySelector("audio"));

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.localAudio.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: new URL(link.href)
                });

                return {
                	document: contentDocument
                };
            },

            audioFileExtensions: [ "mp3" ]
        },

        localImage: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                return link.pathname.endsWithAnyOf(Content.contentTypes.localImage.imageFileExtensions.map(x => `.${x}`));
            },

            isSliceable: true,

            contentFromLink: (link) => {
                //  Import specified dimensions / aspect ratio.
                let dimensions = Content.mediaDimensionsHTMLForMediaLink(link);

                //  Use annotation abstract (if any) as figure caption.
                let caption = Content.figcaptionHTMLForMediaLink(link);

                /*  Note that we pass in the original link’s classes; this
                    is good for classes like ‘invert’, ‘width-full’, etc.
                 */
                let contentDocument = newDocument(`<figure><img
                											${dimensions}
                											class="${link.classList}"
                											src="${link.href}"
                											loading="eager"
                											decoding="sync"
                											>${caption}</figure>`);

                //  Remove extraneous classes.
                Content.removeExtraneousClassesFromMediaElement(contentDocument.querySelector("img"));

                //  Fire contentDidLoad event.
                GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                    source: "Content.contentTypes.localImage.load",
                    container: contentDocument,
                    document: contentDocument,
                    loadLocation: new URL(link.href)
                });

                return {
                	document: contentDocument
                };
            },

            imageFileExtensions: [ "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg" ]
        },

        localPage: {
            matches: (link) => {
                //  Maybe it’s a foreign link?
                if (link.hostname != location.hostname)
                    return false;

                /*  If it has a period in it, it’s probably not a page, but is
                    something else, like a file of some sort, or a locally
                    archived document. Still, we allow for explicit overrides.
                 */
                return (   link.pathname.match(/\./) == null
                        || link.pathname.endsWith("/index") == true
                        || link.classList?.contains("link-page") == true);
            },

            isSliceable: true,

            sourceURLsForLink: (link) => {
                let url = URLFromString(link.href);
                url.hash = "";
                url.search = "";

                return [ url ];
            },

            contentFromResponse: (response, link, sourceURL) => {
                let contentDocument = response
                					  ? newDocument(response)
                					  : document;

                if (response)
                    contentDocument.baseLocation = sourceURL;

                //  Get the body classes.
                let pageBodyClasses = contentDocument.querySelector("meta[name='page-body-classes']").getAttribute("content").trim().split(" ");

                //  Get the page title.
                let pageTitle = contentDocument.querySelector("title").innerHTML.match(Content.contentTypes.localPage.pageTitleRegexp)[1];

                //  Get the page thumbnail URL and metadata.
                let pageThumbnailHTML;
                let pageThumbnailMetaTag = contentDocument.querySelector("meta[property='og:image']");
                if (pageThumbnailMetaTag) {
                    let pageThumbnailURL = URLFromString(pageThumbnailMetaTag.getAttribute("content"));

                    //  Alt text, if provided.
                    let pageThumbnailAltMetaTag = contentDocument.querySelector("meta[property='og:image:alt']");
                    let pageThumbnailAltText = (pageThumbnailAltMetaTag
                                                ? pageThumbnailAltMetaTag.getAttribute("content")
                                                : `Thumbnail image for “${pageTitle}”`
                                                ).replace(/"/g, "&quot;");

                    //  Image dimensions.
                    let pageThumbnailWidth = contentDocument.querySelector("meta[property='og:image:width']").getAttribute("content");
                    let pageThumbnailHeight = contentDocument.querySelector("meta[property='og:image:height']").getAttribute("content");

                    //  Construct and save the <img> tag.
                    if (pageThumbnailURL.pathname.startsWith(Content.contentTypes.localPage.defaultPageThumbnailPathnamePrefix) == false)
                        pageThumbnailHTML = `<img
                            src="${pageThumbnailURL.href}"
                            title="${pageThumbnailAltText}"
                            width="${pageThumbnailWidth}"
                            height="${pageThumbnailHeight}"
                            style="width: ${pageThumbnailWidth}px; height: auto;"
                                >`;

                    //  Request the image, to cache it.
                    doAjax({ location: pageThumbnailURL.href });
                }

                if (response) {
                    //  Fire contentDidLoad event.
                    GW.notificationCenter.fireEvent("GW.contentDidLoad", {
                        source: "Content.contentTypes.localPage.load",
                        container: contentDocument,
                        document: contentDocument,
                        loadLocation: sourceURL
                    });
                }

                return {
                    document:       contentDocument,
                    title:          pageTitle,
                    bodyClasses:    pageBodyClasses,
                    thumbnailHTML:  pageThumbnailHTML
                };
            },

			referenceDataCacheKeyForLink: (link) => {
				let cacheKey = modifiedURL(link, { hash: "", search: "" }).href;
				if (link.dataset?.pageSectionId > "")
					cacheKey += ":::" + link.dataset.pageSectionId;
				return cacheKey;
			},

			referenceDataCacheKeyMatchesLink: (cacheKey, link) => {
				return cacheKey.startsWith(modifiedURL(link, { hash: "", search: "" }).href);
			},

            referenceDataFromContent: (pageContent, link) => {
                let pageContentDocument = newDocument();

				//	If a page section is specified, extract it.
				if (link.dataset?.pageSectionId > "")
					pageContentDocument.appendChild(pageContent.document.querySelector("#" + link.dataset.pageSectionId)?.cloneNode(true));

                /*  Otherwise (or if the specified section does not exist), the
                	default page content is the page body plus the metadata
                	block.
                 */
				if (pageContentDocument.childNodes.length == 0) {
					//  Add the page metadata block.
					let pageMetadataBlock = pageContent.document.querySelector("article > #page-metadata");
					if (pageMetadataBlock) {
						pageMetadataBlock = pageContentDocument.appendChild(pageMetadataBlock.cloneNode(true));
						pageMetadataBlock.classList.remove("markdownBody");
						if (pageMetadataBlock.className == "")
							pageMetadataBlock.removeAttribute("class");
					}

					//  Add the page main content block.
					pageContentDocument.append(newDocument(pageContent.document.querySelector("#markdownBody").childNodes));
				}

                return {
                    content:                 pageContentDocument,
                    pageTitle:               pageContent.title,
                    pageBodyClasses:         pageContent.bodyClasses,
                    pageThumbnailHTML:       pageContent.thumbnailHTML,
                    shouldLocalize:          true
                }
            },

            permittedContentTypes: [ "text/html" ],
            pageTitleRegexp: /^(.+?) · Gwern\.net( \(reader mode\))?$/,
            defaultPageThumbnailPathnamePrefix: "/static/img/logo/logo-"
        }
    }
};
/* author: Said Achmiz */
/* license: MIT */

/****************/
/* TRANSCLUSION */
/****************/

/*  Transclusion is dynamic insertion, into a document, of part or all of
    a different document.


    I. BASICS
    =========

    Put an include-link into the page, and at load time, the link will be
    replaced by the content it specifies.

    An include-link is a link (<a> tag) which has the `include` class, e.g.:

        <a class="include" href="/Sidenotes#comparisons"></a>

    At load time, this tag will be replaced with the `#comparisons` section of
    the /Sidenotes page.

    If the include-link’s URL (i.e., the value of its `href` attribute) has no
    hash (a.k.a. fragment identifier), then the entire page content will be
    transcluded. (If the page contains an element with the `markdownBody` ID,
    then only the contents of that element will be transcluded; otherwise, the
    contents of the `body` element will be transcluded; if neither element is
    present, then the complete contents of the page will be transcluded.)

    If the include-link’s URL has a hash, and the page content contains an
    element with an ID matching the hash, then only that element (or that
    element’s contents; see the `include-unwrap` option, below) will be
    transcluded. (If the URL has a hash but the hash does not identify any
    element contained in the page content, nothing is transcluded.)

    (See the ADVANCED section, below, for other ways to use an include-link’s
     URL hash to specify parts of a page to transclude.)


    II. OPTIONS
    ===========

    Several optional classes modify the behavior of include-links:

    include-annotation
    include-content
        If the include-link is an annotated link, then instead of transcluding
        the linked content, the annotation for the linked content may be
        transcluded.

        The default behavior is set via the
        Transclude.transcludeAnnotationsByDefault property. If this is set to
        `true`, then fully (not partially!) annotated links transclude the
        annotation unless the `include-content` class is set (in which case they
        transclude their linked content). If it is set to `false`, then fully
        annotated links transclude the annotation only if the
        `include-annotation` class is set (otherwise they transclude their
        linked content).

		Note that merely partially annotated links always default to
		transcluding content, unless the `include-annotation` class is set.
		(See also the `include-annotation-partial` alias class.)

    include-strict
        By default, include-links are lazy-loaded. A lazy-loaded include-link
        will not trigger (i.e., transclude its content) immediately at load
        time. Instead, it will wait until the user scrolls down to the part of
        the page where the link is located, or pops up a popup that contains
        that part of the page, or otherwise “looks” at the include-link’s
        surrounding context. Only then will the transclusion take place.
        A strict include-link, on the other hand, triggers immediately at
        load time.

        Note that `include-strict` implies `include-even-when-collapsed`,
        because otherwise odd behavior can result (eg. a ‘strict’ transclusion
        in the first line or two of a collapse will be visibly untranscluded;
        and collapses blocking strict transclusion can lead to unpredictable
        breakage when the contents of the transclusion are depended upon by the
        rest of the page, and collapses are added/removed by editors).

	include-lazy
		By default, include-links are loaded when they are within some scroll
		distance away from the view rect of their scroll container (i.e., the
		viewport, or the frame of a pop-frame, etc.); this is done so that the
		transcluded content is likely to already be loaded by the time the user
		scrolls to the include-link’s position in the document flow.

		The `include-lazy` option makes the transclusion behavior lazier than
		usual; an include-link with this class will trigger only when it crosses
		the boundary of the viewport (or the scroll container’s view rect).

		Note that if the `include-strict` option is set, then `include-lazy`
		will have no effect. Similarly, if the `include-even-when-collapsed`
		option is *not* set (assuming that `include-strict` is also not set),
		then `include-lazy` will have no effect if the include-link is within
		a collapsed block.

    include-even-when-collapsed
        Normally, an include-link that is inside a collapsed block will not
        trigger at load time; instead, it will trigger only when it is revealed
        by expansion of its containing collapse block(s). The
        `include-even-when-collapsed` class disables this delay, forcing the
        include-link to trigger when revealed by scrolling (if it is not marked
        as `include-strict`; otherwise, `include-strict` will force the
        include-link to trigger at load time, regardless of anything to do with
        collapses) even if, at such time, it is within a collapsed block.

        Note that the `include-strict` and `include-even-when-collapsed` options
        do not do the same thing; the former implies the latter, but not the
        other way around.

    include-unwrap
        Normally, when an include-link’s URL specifies an element ID to
        transclude, the element with that ID is transcluded in its entirety.
        When the `include-unwrap` option is used, the element itself is
        discarded, and only the element’s contents are transcluded.

        (This option has no effect unless the include-link’s URL hash specifies
         a single element ID to transclude.)

	include-block-context
	data-block-context-options
		Normally, when an include-link’s URL specifies an element ID to
		transclude, only (at most; see `include-unwrap`) that element is
		transcluded. When the `include-block-context` option is used, not only
		the identified element itself, but also its containing block element
		(and everything within) will be included. (What “block element” means
		in this context is not the same as what the HTML spec means by the
		term. Determination of what counts as a block element is done in a
		content-aware way.)

		If `include-unwrap` is used as well as `include-block-context`, then the
		identified element’s containing block will be unwrapped, and the
		included content will be all the child nodes of the identified element’s
		containing block.

        (This option has no effect unless the include-link’s URL hash specifies
         a single element ID to transclude.)

		The `data-block-context-options` attribute allows various options to be
		specified for how block context should be determined and handled. The
		value of this attribute is a pipe (`|`) separated list of option fields.
		The following options may be specified:

		expanded
			Expanded block context mode omits paragraphs (the <p> element) from
			consideration as containing blocks.

	include-rectify-not
		Normally, when transclusion occurs, the surrounding HTML structure is
		intelligently rectified, to preserve block containment rules and so on.
		When the `include-rectify-not` option is used, this rectification is
		not done.

		(Not currently used on gwern.net.)

    include-identify-not
        Normally, if the include-link has a nonempty ‘id’ attribute, and that
        ID does not occur in the transcluded content (after any unwrapping; see
        ‘include-unwrap’, above, for details), the content will be wrapped in a
        DIV element, which will be given the ID of the include-link. When the
        `include-identify-not` option is used, this will not be done.

		(Not currently used on gwern.net.)

	include-localize-not
		When content specified by an include-link is transcluded into the base
		page, and the transcluded content has headings, should those headings be
		added to the page’s table of contents? When transcluded content has
		footnote references, should those citations be integrated into the host
		page’s footnote numbering, and should the associated footnotes be added
		to the host page’s footnotes section?

		Normally, the answer (and it’s the same answer for both questions, and
		several related ones such as link qualification) is determined on the
		basis of the content type of the transcluded content, the context in
		which it’s being transcluded (e.g., a backlink context block), and some
		other factors. If the `include-localize-not` option is used, however,
		the content will NOT be “localized”, no matter what other conditions
		may obtain.

	include-spinner
    include-spinner-not
        Shows or hides the “loading spinner” that is shown at the site of the
        include-link while content to be transcluded is being retrieved. In the
        absence of either of these classes, the spinner will be shown or not,
        depending on context. Using either class causes the spinner to be shown
        or not shown (respectively), unconditionally.

		(Note that these two classes, unlike the others listed in this section,
		 DO NOT mark a link as an include-link. They must be used in conjunction
		 with the `include` class, or with one or more of the optional include
		 classes listed here.)


    III. ADVANCED
    =============

	1. Transclude range syntax
	--------------------------

    The transclusion feature supports PmWiki-style transclude range syntax,
    very similar to the one described here:
    https://www.pmwiki.org/wiki/PmWiki/IncludeOtherPages#includeanchor

    To use transclude range syntax, an include-link’s URL should have a “double”
    hash, i.e. a hash consisting of two ‘#’-prefixed parts:

        <a class="include" href="/Sidenotes#tufte-css#tables"></a>

    This will include all parts of the "/Sidenotes" page’s content starting from
    the element with ID `tufte-css`, all the way up to (but *not* including!)
    the element with ID `tables`.

    Either the first or the second identifier (the parts after the ‘#’) may
    instead be empty. The possibilities are:

    #foo#bar
        Include everything starting from element `#foo` up to (but not
        including) element `#bar`.

    ##bar
        Include everything from the start of the page content up to (but not
        including) element `#bar`.

    #foo#
        Include everything starting from element `#foo` to the end of the page.

    ##
        Include the entire page content (same as not having a hash at all).

    In all cases, only the page content is considered, not any “page furniture”
    (i.e., only the contents of `#markdownBody`, if present; or only the
     contents of `<body>`, if present; or the whole page, otherwise).

    If an element of one of the specified IDs is not found in the page, the
    transclusion fails.

    If both elements are present, but the end element does not follow the start
    element in the page order (i.e., if the start element comes after the end
    element, or if they are the same), then the transcluded content is empty.

	2. Include template
	-------------------

	The `data-include-template` attribute allows selection of include template
	to use.

	(Note that some include data sources specify a template by default;
	 the `data-include-template` attribute overrides the default in such cases.)

	If a template is specified, the included content is treated as a template
	data source, rather than being included directly. (See comment for the
	templateDataFromHTML() function for information about how template data
	is specified in HTML. Note that some data sources provide template data in
	pre-constructed object form, which bypasses the need to extract it from
	HTML source.)

	If the value of this attribute begins with the ‘$’ character, then the rest
	if the attribute value (after the dollar sign) is treated as a key into the
	template data object, rather than directly as the name of a template file.
	This allows a template data source to specify different templates for use
	in different contexts. (For example, a template data source may specify a
	default template, to be used when transcluding normally, and a different
	template to be used when the transcluded content is to be used as the
	content of a pop-frame. In such a case, the template data object might have
	a field with key `popFrameTemplate` whose value is the name of a template,
	and the include-link’s `data-include-template` attribute would have a value
	of `$popFrameTemplate`.)

	3. Selector-based inclusion/exclusion
	-------------------------------------

	The `data-include-selector` and `data-include-selector-not` attributes allow
	the use of CSS selectors to specify parts of the included DOM subtree to
	include or omit. (If both attributes are present,
	`data-include-selector-not` is applied first.)

	The `data-include-selector-options`, `data-include-selector-not-options`,
	and `data-include-selector-general-options` attributes allows various
	options to be specified for how the selectors should be applied. The values
	of these attributes are pipe (`|`) separated lists of option fields. The
	`-options` version of the attribute applies only to `data-include-selector`;
	`-not-options` applies only to `data-include-selector-not`; and
	`-general-options` applies to both. (The specific options attributes take
	precedence over the general options attribute.)

	The following options may be specified:

	first
		Select only the first element matching the specified selector, instead
		of selecting all matching elements. (In other words, use querySelector()
		instead of querySelectorAll().)

	(NOTE: `data-include-selector` may be seen as a generalization of the
	 `include-block-context` option, described above. Note, however, that both
	 `include-block-context` and either or both of `data-include-selector` /
	 `data-include-selector-not` may be used simultaneously. The effects of the
	 data attributes are applied last, after all `include-*` options have been
	 applied.)


	IV. ALIASES
	===========

	The following classes, set on include-links, function as aliases for various
	combinations of the above-described functionality. Each entry below lists
	the alias class (or set of multiple specific classes, in some cases),
	followed by the combination of classes, data attributes, etc. to which the
	alias is equivalent. Some entries also include usage notes.

	class="include-block-context-expanded"

		class="include-block-context"
		data-block-context-options="expanded"

		“Expanded block context” typically means “broaden the block context
		beyond a single paragraph”.

	class="include-annotation-partial"

		class="include-annotation"
		data-include-selector-not=".annotation-abstract, .file-includes, figure, .data-field-separator"
		data-template-fields="annotationClassSuffix:$"
		data-annotation-class-suffix="-partial"

		Includes only the metadata of annotations (omitting the annotation
		abstract, i.e. the body of the annotation, if any). Formats the included
		annotation as a partial.

	class="include-annotation-core"

		class="include-annotation"
		data-include-selector=".annotation-abstract, .file-includes"

		Essentially the opposite of .include-annotation-partial; includes only
		the annotation abstract, omitting metadata. (If there is no abstract -
		i.e., if the annotation is a partial - the included content will be
		empty.)

	class="include-content-core"

		class="include-content"
		data-include-selector-not="#footnotes, #backlinks-section,
			#similars-section, #link-bibliography-section,
			#page-metadata .link-tags, #page-metadata .page-metadata-fields"

		Include a page’s content, omitting “auxiliary” content sections
		(Footnotes, Backlinks, Similar Links, Link Bibliography), as well as
		the page tags and the date/status/confidence/importance/etc. metadata
		fields block.

		Note that this option is redundant when transcluding into a full page
		(i.e., a page with a #page-metadata section), because in such a case,
		all auxiliary content sections, as well as the entire #page-metadata
		section, are stripped from a transcluded page. (The content of some of
		the stripped sections, such as the backlinks and the footnotes, are
		then integrated into the host page.)

	class="include-content-no-header"

		class="include-unwrap"
		data-include-selector-not="h1, h2, h3, h4, h5, h6"
		data-include-selector-not-options="first"

		Applied to an include-link that targets a <section>, will include only
		the content of the section; the <section> will be unwrapped, and the
		heading discarded. (If applied in some other case, behavior may be
		unpredictable.)

	class="include-caption-not"

		data-include-selector-not=".caption-wrapper"

		Normally, media (image, video, audio) include-links which have
		annotations will, when transcluded, get a <figcaption> whose contents
		are the abstract of the annotation. If the `include-caption-not` class
		is set, the caption is omitted. (This class has no effect if applied to
		include-links of non-media content types.)
 */

/******************************************************************************/
/*	Extract template data from an HTML string or DOM object by looking for
	elements with either the `data-template-field` or the
	`data-template-fields` attribute.

	If the `data-template-fields` attribute is not present but the
	`data-template-field` attribute is present, then the value of the latter
	attribute is treated as the data field name; the .innerHTML of the
	element is the field value.

	If the `data-template-fields` attribute is present, then the attribute
	value is treated as a comma-separated list of
	`fieldName:fieldValueIdentifier` pairs. For each pair, the part before the
	colon (the fieldName) is the data field name. The part after the colon
	(the fieldValueIdentifier) can be interpreted in one of two ways:

	If the fieldValueIdentifier begins with a dollar sign (the ‘$’ character),
	then the rest of the identifier (after the dollar sign) is treated as the
	name of the attribute of the given element which holds the field value.

	If the fieldValueIdentifier is _only_ the ‘$’ character, then the field
	value will be the value of the data attribute that corresponds to the
	field name (i.e., if the field is `fooBar`, then the field value will be
	taken from attribute `data-foo-bar`).

	If the fieldValueIdentifier begins with a period (the ‘.’ character), then
	the rest of the identifier (after the period) is treated as the name of the
	DOM object property of the given element which holds the field value.

	If the fieldValueIdentifier is _only_ the ‘.’ character, then the field
	value will be the value of the element property matching the field name
	(i.e., if the field name is `fooBar`, then the field value will be the
	value of the element’s .fooBar property).

	Examples:

		<span data-template-field="foo">Bar</span>

			This element defines a data field with name `foo` and value `Bar`.

		<span data-template-fields="foo:$title" title="Bar"></span>

			This element defines one data field, with name `foo` and value `Bar`.

		<span data-template-fields="foo:$title, bar:.tagName" title="Baz"></span>

			This element defines two data fields: one with name `foo` and value
			`Baz`,and one with name `bar` and value `SPAN`.

		<span data-template-field="foo:title" title="Bar"></span>

			This element defines no data fields. (Likely this is a typo, and
			the desired attribute name is actually `data-template-fields`; note
			the plural form.)
 */
//	(string|Document|DocumentFragment|Element) => object
function templateDataFromHTML(html) {
	let dataObject = { };

	if ((   html instanceof Document
		 || html instanceof DocumentFragment) == false)
		html = newDocument(html);

	html.querySelectorAll("[data-template-field], [data-template-fields]").forEach(element => {
		if (element.dataset.templateFields) {
			element.dataset.templateFields.split(",").forEach(templateField => {
				let [ beforeColon, afterColon ] = templateField.trim().split(":");
				let fieldName = beforeColon.trim();
				let fieldValueIdentifier = afterColon.trim();

				if (fieldValueIdentifier.startsWith(".")) {
					dataObject[fieldName] = fieldValueIdentifier == "."
											? element[fieldName]
											: element[fieldValueIdentifier.slice(1)];
				} else if (fieldValueIdentifier.startsWith("$")) {
					dataObject[fieldName] = fieldValueIdentifier == "$"
											? element.dataset[fieldName]
											: element.getAttribute(fieldValueIdentifier.slice(1));
				}
			});
		} else {
			dataObject[element.dataset.templateField] = element.innerHTML;
		}
	});

	return dataObject;
}

/************************************************************************/
/*	Return either true or false, having evaluated the template expression
	(used in conditionals, e.g. `<[IF !foo & bar]>baz<[IFEND]>`).
 */
function evaluateTemplateExpression(expr, valueFunction = (() => null)) {
	if (expr == "_TRUE_")
		return true;

	if (expr == "_FALSE_")
		return false;

	if (expr == "")
		return false;

	let constants = [
		"_TRUE_",
		"_FALSE_"
	];

	let constantRegExp = new RegExp(/^_(\S*)_$/);
	let literalRegExp = new RegExp(/^<<(.*)>>$/);

	return evaluateTemplateExpression(expr.replace(
		//	Quotes.
		/(['"])(.*?)(\1)/g,
		(match, leftQuote, quotedExpr, rightQuote) =>
		"<<" + fixedEncodeURIComponent(quotedExpr) + ">>"
	).replace(
		//	Brackets.
		/\s*\[\s*(.+?)\s*\]\s*/g,
		(match, bracketedExpr) =>
		(evaluateTemplateExpression(bracketedExpr, valueFunction)
		 ? "_TRUE_"
		 : "_FALSE_")
	).replace(
		//	Boolean AND, OR.
		/\s*([^&|]+?)\s*([&|])\s*(.+)\s*/g,
		(match, leftOperand, operator, rightOperand) => {
			let leftOperandTrue = evaluateTemplateExpression(leftOperand, valueFunction);
			let rightOperandTrue = evaluateTemplateExpression(rightOperand, valueFunction);
			let expressionTrue = operator == "&"
								 ? (leftOperandTrue && rightOperandTrue)
								 : (leftOperandTrue || rightOperandTrue);
			return (expressionTrue
					? "_TRUE_"
					: "_FALSE_");
		}
	).replace(
		//	Boolean NOT.
		/\s*!\s*(\S+|<<.+?>>)\s*/g,
		(match, operand) =>
		(evaluateTemplateExpression(operand, valueFunction)
		 ? "_FALSE_"
		 : "_TRUE_")
	).replace(
		//	Comparison.
		/\s*(\S+|<<.+?>>)\s+(\S+|<<.+?>>)\s*/,
		(match, leftOperand, rightOperand) => {
			if (   constantRegExp.test(leftOperand)
				|| constantRegExp.test(rightOperand)) {
				return (   evaluateTemplateExpression(leftOperand, valueFunction)
						== evaluateTemplateExpression(rightOperand, valueFunction)
						? "_TRUE_"
						: "_FALSE_");
			} else {
				leftOperand = literalRegExp.test(leftOperand)
							  ? decodeURIComponent(leftOperand.slice(2, -2))
							  : valueFunction(leftOperand);
				rightOperand = literalRegExp.test(rightOperand)
							   ? decodeURIComponent(rightOperand.slice(2, -2))
							   : valueFunction(rightOperand);
				return (leftOperand == rightOperand
						? "_TRUE_"
						: "_FALSE_");
			}
		}
	).replace(/\s*(\S+|<<.+?>>)\s*/g,
		//	Constant, literal, or field name.
		(match, string) => {
			//	Constant.
			if (constantRegExp.test(string))
				return (constants.includes(string)
						? string
						: "");

			//	Literal.
			if (literalRegExp.test(string))
				return (string.length > "<<>>".length
						? "_TRUE_"
						: "_FALSE_");

			//	Field name.
			return (valueFunction(string)
					? "_TRUE_"
					: "_FALSE_");
		}
	));
}

/******************************************************************************/
/*	TEMPLATE SYNTAX REFERENCE
	=========================

	The following syntactic elements are available in the transclude.js
	template syntax (as used, e.g., in the .tmpl files loaded by the build
	scripts); these are listed in order of evaluation.

	1. Line continuations.

	   The following sequence of characters:

		[closing angle bracket (‘>’)]
		[backslash (‘\’)]
		[newline character]
		[zero or more whitespace characters]
		[opening angle bracket (‘<’)]

	   … collapses into the following sequence:

		[closing angle bracket (‘>’)]
		[opening angle bracket (‘<’)]

	   (This allows nicely formatted and readable template source files,
	    without introducing undesired whitespace into the rendered HTML.)

	2. Comments.

	   The sequences ‘<(’ and ‘)>’ delineate a template comment. In the
	   rendered HTML, any such comment is replaced with the empty string.

	3. Escaped characters.

	   There are two forms of the character escape syntax, a simple form and a
	   full form. During template processing, any escapes in the simple form
	   are transformed into escapes in the full form; the latter are processed
	   last (after conditionals are evaluated and data variable substitutions
	   performed).

	   The simple form escape syntax is a backslash (‘\’), followed by any
	   character. (Note that only a single code point will be escaped, not an
	   extended grapheme cluster.)

	   The full form escape syntax is delineated by ‘<[:’ and ‘:]>’, containing
	   a slash (‘/’) separated sequence of zero or more Unicode code points in
	   decimal form. (During processing, this is transformed into the string
	   which consists of that sequence of code points.)

	   NOTE on escaping: angle brackets (‘<’ and ‘>’) do not need to be escaped
	   when they appear within quote-wrapped HTML attribute values (or within
	   template expressions that will resolve into strings that appear within
	   quote-wrapped HTML attribute values). When angle brackets appear outside
	   of quote-wrapped HTML attribute values, they must be escaped as HTML
	   entities (‘<’ as ‘&lt;’ and ‘>’ as ‘&gt;’). Escaping angle brackets via
	   the template escaping syntax is NOT a substitute for HTML escaping!

	4. Conditionals.

	   The template syntax supports nested conditionals, so content wrapped in
	   a conditional can itself contain conditionals. In order to do this, the
	   conditional syntax requires that each nested level of conditionals be
	   indicated.

	   The basic conditional syntax is:

	    <[IF $TEMPLATE_CONDITIONAL_EXPRESSION]>foo<[IFEND]>

	   or:

	    <[IF $TEMPLATE_CONDITIONAL_EXPRESSION]>foo<[ELSE]>bar<[IFEND]>

	   The first form resolves into “foo” if $TEMPLATE_EXPRESSION evaluates to
	   true, the empty string otherwise. The second form resolves into “foo” if
	   $TEMPLATE_EXPRESSION evaluates to true, “bar” otherwise.

	   To indicate nesting level, a numeric sequence is added to the operators:

	    <[IF1 $TEMPLATE_CONDITIONAL_EXPRESSION]>foo<[ELSE1]>bar<[IF1END]>

	   The template conditional expression syntax is described in the next
	   section.

	5. Data variable substitutions.

	   The sequences ‘<{’ and ‘}>’ delineate a data variable name. This will
	   resolve into the stringified form of the value of the variable of that
	   name. This value is retrieved by using the variable name as an index
	   into template fill context object, else (if no context object is given
	   or the context object has no non-null value for that variable name) into
	   the template data object. If the template data object also has no
	   non-null value for that index, then the data variable expression
	   resolves into the empty string.


	TEMPLATE CONDITIONAL EXPRESSION SYNTAX REFERENCE
	================================================

	Template conditional expressions always return true or false. They are
	evaluated recursively. The available operators are listed below, in order
	of evaluation within a single evaluation pass.

	(Note that whitespace is permitted in conditional expressions. Whitespace
	 characters are ignored, except within quote-wrapped string literals, and
	 between the operands of the comparison operator; see below for more.)

	0. Constants.

	   The expression “_TRUE_” is evaluated as true. The expression “_FALSE_”
	   is evaluated as false. The empty string likewise evaluates as false.

	1. Quotation.

	   A string wrapped in quotes (these may be single quotes, ‘'’; double
	   quotes, ‘"’; or double angle brackets ‘<<’ ‘>>’; note that the latter
	   are not the double angle quotation marks ‘«’ ‘»’, but rather pairs of
	   the ordinary single angle brackets, ‘<’ ‘>’). When used as an operand of
	   the comparison operator (see below), a quoted string is treated as a
	   string literal. Otherwise, evaluates to true if the quoted string is
	   nonempty, false otherwise.

	2. Brackets.

	   Square brackets (‘[’ and ‘]’) delineate a nested expression, which
	   evaluates to one of the boolean constants, “_TRUE_” or “_FALSE_”.

	3. Boolean comparison.

	   The operators ‘&’ (AND) and ‘|’ (OR) have the same precedence, and are
	   right-associative. They evaluate to one of the boolean constants.

	4. Boolean negation.

	   The negation operator ‘!’ (NOT) precedes the operand (which must be
	   either a quoted string literal, or else a non-quoted-wrapped sequence of
	   non-whitespace characters), and evaluates as “_FALSE_” if the operand
	   evalutes to false, as “_TRUE_” otherwise.

	5. Comparison.

	   Two operands (each of which may be a quoted string literal, or else a
	   non-quote-wrapped sequence of non-whitespace characters) separated by
	   whitespace are compared, evaluating to “_TRUE_” if they are equal,
	   “_FALSE_” otherwise.

	   How equality is tested depends on the type of the operands:

	   - If either operand is a boolean constants, then both operands are
	     evaluated and the values (true or false) compared.
	   - Otherwise, each operand is either unwrapped from quotes (if it is a
	     quote-wrapped string literal) and URI-decoded, or else treated as a
	     data variable name and its value retrieved (see “Data variable
	     substitutions” in the previous section); the operands are then tested
	     for equality using the JavaScript ‘==’ operator.

	   Naturally, the comparison expression evaluates as “_TRUE_” if the
	   operands are found to be equal, as “_FALSE_” otherwise.

	6. Single term.

	   A string by itself, not part of one of the above operations, is either
	   a constant, or a literal, or a data variable name.

	   If the string begins and ends with underscores (‘_’), it is treated as a
	   constant; if it is equal to one of the boolean constants, the string
	   evaluates as that constant; otherwise, as the empty string (and thus
	   as false).

	   If the string is a quote-wrapped (i.e., double-angle-bracket-wrapped)
	   string literal, evaluates as true if the quoted string is nonempty,
	   false otherwise.

	   Otherwise, the string is treated as a data variable name, and its value
	   retrieved (see “Data variable substitutions” in the previous section);
	   the term then evaluates as true if the value is truthy, false otherwise.
 */

/******************************************************************************/
/*	Fill a template with provided reference data (supplemented by an optional
	context object).

	Reference data may be a data object, or else an HTML string (in which case
	the templateDataFromHTML() function is used to extract data from the HTML).

	If no ‘data’ argument is provided, then the template itself will be parsed
	to extract reference data (again, using the templateDataFromHTML()
	function).

	(Context argument must be an object, not a string.)

	Available options (defaults):

		preserveSurroundingWhitespaceInConditionals (false)
			If true, `<[IF foo]> bar <[IFEND]>` becomes ` bar `;
			if false, `bar`.

		fireContentLoadEvent (false)
			If true, a GW.contentDidLoad event is fired on the filled template.
 */
//	(string, string|Document|DocumentFragment|object, object, object) => DocumentFragment
function fillTemplate(template, data = null, context = null, options) {
	options = Object.assign({
		preserveSurroundingWhitespaceInConditionals: false,
		fireContentLoadEvent: false
	}, options);

	if (   template == null
		|| template == "LOADING_FAILED")
		return null;

	//	If no data source is provided, use the template itself as data source.
	if (   data == null
		|| data == "LOADING_FAILED")
		data = template;

	/*	If the data source is a string, assume it to be HTML and extract data;
		likewise, if the data source is a Document or a DocumentFragment,
		extract data.
	 */
	if (   typeof data == "string"
		|| data instanceof Document
		|| data instanceof DocumentFragment)
		data = templateDataFromHTML(data);

	/*	Integrate standard fill context.
	 */
	context = Object.assign({ }, Transclude.standardTemplateFillContext, context);

	/*	Data variables specified in the provided context argument (if any)
		take precedence over the reference data.
	 */
	let valueFunction = (fieldName) => {
		return (context[fieldName] ?? data[fieldName]);
	};

	//	Line continuations.
	template = template.replace(
		/>\\\n\s*</gs,
		(match) => "><"
	);

	//	Comments.
	template = template.replace(
		/<\(.+?\)>/gs,
		(match) => ""
	);

	//	Escapes.
	template = template.replace(
		/\\(.)/gsu,
		(match, escaped) => "<[:" + escaped.codePointAt(0) + ":]>"
	);

	/*	Conditionals. JavaScript’s regexps do not support recursion, so we
		keep running the replacement until no conditionals remain.
	 */
	let didReplace;
	do {
		didReplace = false;
		template = template.replace(
			/<\[IF([0-9]*)\s+(.+?)\]>(.+?)(?:<\[ELSE\1\]>(.+?))?<\[IF\1END\]>/gs,
			(match, nestLevel, expr, ifValue, elseValue) => {
				didReplace = true;
				let returnValue = evaluateTemplateExpression(expr, valueFunction)
								  ? (ifValue ?? "")
								  : (elseValue ?? "");
				return options.preserveSurroundingWhitespaceInConditionals
					   ? returnValue
					   : returnValue.trim();
			});
	} while (didReplace);

	//	Data variable substitution.
	template = template.replace(
		/<\{(.+?)\}>/g,
		(match, fieldName) => (valueFunction(fieldName) ?? "")
	);

	//	Escapes, redux.
	template = template.replace(
		/<\[:(.+?):\]>/gs,
		(match, codePointSequence) => String.fromCodePoint(...(codePointSequence.split("/").map(x => parseInt(x))))
	);

	//	Construct DOM tree from filled template.
	let outputDocument = newDocument(template);

	//	Fire GW.contentDidLoad event, if need be.
	if (options.fireContentLoadEvent) {
		let loadEventInfo = {
            container: outputDocument,
            document: outputDocument
        };

		if (options.loadEventInfo)
			for (let [key, value] of Object.entries(options.loadEventInfo))
				if ([ "container", "document" ].includes(key) == false)
					loadEventInfo[key] = value;

		GW.notificationCenter.fireEvent("GW.contentDidLoad", loadEventInfo);
	}

	return outputDocument;
}

/*****************************************************************************/
/*	Construct synthetic include-link. The optional ‘link’ argument may be
	a string, a URL object, or an HTMLAnchorElement, in which case it, or its
	.href property, is used as the ‘href’ attribute of the synthesized
	include-link.
 */
function synthesizeIncludeLink(link, attributes, properties) {
	let includeLink = newElement("A", attributes, properties);

	if (link == null)
		return includeLink;

	if (typeof link == "string") {
		includeLink.href = link;
	} else if (link instanceof HTMLAnchorElement) {
		includeLink.href = link.getAttribute("href");
	} else if (link instanceof URL) {
		includeLink.href = link.href;
	} else {
		return null;
	}

	if (link instanceof HTMLAnchorElement) {
		//	Import source link classes.
		includeLink.classList.add(...(Array.from(link.classList).filter(linkClass =>
			(   [ "link-annotated",
				  "link-annotated-partial",
				  "has-annotation",
				  "has-content",
				  "has-icon",
				  "has-indicator-hook"
				  ].includes(linkClass) == false
			 && linkClass.startsWith("include-") == false)
		)));

		//	Import source link data attributes.
		for (let [ attrName, attrValue ] of Object.entries(link.dataset))
			includeLink.dataset[attrName] = attrValue;
	}

	//	In case no include classes have been added yet...
	if (Transclude.isIncludeLink(includeLink) == false)
		includeLink.classList.add("include");

	return includeLink;
}

/*************************************************************************/
/*	Return appropriate loadLocation for given include-link. (May be null.)
 */
function loadLocationForIncludeLink(includeLink) {
    if (Transclude.isAnnotationTransclude(includeLink) == false) {
    	return (   Content.sourceURLsForLink(includeLink)?.first
    			?? includeLink.eventInfo.loadLocation);
    } else {
    	return null;
    }
}

/*******************************************************************************/
/*	Return appropriate contentType string for given include-link. (May be null,
	but probably shouldn’t be.)
 */
function contentTypeIdentifierForIncludeLink(includeLink) {
	if (   Transclude.isAnnotationTransclude(includeLink)
		|| (   Content.contentTypes.localFragment.matches(includeLink)
			&& /^\/metadata\/annotation\/[^\/]+$/.test(includeLink.pathname))) {
		return "annotation";
	} else if (Content.contentTypes.localFragment.matches(includeLink)) {
		let auxLinksLinkType = AuxLinks.auxLinksLinkType(includeLink);
		if (auxLinksLinkType)
			return auxLinksLinkType;
	}

	return Content.contentTypeNameForLink(includeLink);
}

/*****************************************************************/
/*	Standardized parsing for a pipe (`|`) separated options field.
	(Returns null if no non-whitespace options are provided.)
 */
function parsePipedOptions(attributeValue) {
	return attributeValue?.split("|").map(x => x.trim()).filter(x => x > "");
}

/******************************************************************************/
/*	Returns true if content specified by the given include-link should be
	“localized” (i.e., integrated into the page structure - footnotes, table of
	contents, etc. - of the document into which it is being transcluded); false
	otherwise.
 */
function shouldLocalizeContentFromLink(includeLink) {
	if (includeLink.classList.contains("include-localize-not"))
		return false;

	if (includeLink.eventInfo.localize == false)
		return false;

	if (Transclude.dataProviderForLink(includeLink).shouldLocalizeContentFromLink?.(includeLink) == false)
		return false;

	return true;
}

/*******************************************************************************/
/*	Adds `block-context-highlighted` class to element targeted by the given link
	in the given document, if the targeted element exists, and if it is NOT the
	only immediately child of the document itself.
 */
function highlightTargetElementInDocument(link, doc) {
	let targetElement = targetElementInDocument(link, doc);
	if (targetElement
		&& (   targetElement.parentNode == doc
			&& isOnlyChild(targetElement)
			) == false) {
		targetElement.classList.add("block-context-highlighted");

		/*	When highlighting <div> elements, place the manicule appropriately
			(and only if appropriate).
		 */
		if (   targetElement.tagName == "DIV"
			&& previousBlockOf(targetElement)?.matches(".heading") == false)
			targetElement.querySelector("p")?.classList.add("block-context-highlight-here");
	}
}

/***********************************************************************/
/*  Replace an include-link with the given content (a DocumentFragment).
 */
//  Called by: Transclude.transclude
function includeContent(includeLink, content) {
    GWLog("includeContent", "transclude.js", 2);

	/*  We skip include-links for which a transclude operation is already in
		progress or has completed (which might happen if we’re given an
		include-link to process, but that link has already been replaced by its
		transcluded content and has been removed from the document).
	 */
	if (includeLink.classList.containsAnyOf([
		"include-in-progress",
		"include-complete"
	])) return;

    /*  Just in case, do nothing if the element-to-be-replaced (either the
    	include-link itself, or its container, as appropriate) isn’t attached
    	to anything.
     */
    if (includeLink.parentNode == null)
        return;

    //  Prevent race condition, part I.
    includeLink.classList.add("include-in-progress");

    //  Document into which the transclusion is being done.
    let containingDocument = includeLink.eventInfo.document;
    let transcludingIntoFullPage = (containingDocument.querySelector(".markdownBody > #page-metadata, #page-metadata.markdownBody") != null);

	//	WITHIN-WRAPPER MODIFICATIONS BEGIN

    //  Wrap (unwrapping first, if need be).
    let wrapper = newElement("SPAN", { "class": "include-wrapper" });
    if (   includeLink.classList.contains("include-unwrap")
        && isAnchorLink(includeLink)
        && content.childElementCount == 1) {
		wrapper.id = content.firstElementChild.id;
		wrapper.append(...content.firstElementChild.childNodes);
    } else {
        wrapper.append(content);
    }

    //  Inject wrapper.
    includeLink.parentNode.insertBefore(wrapper, includeLink);

	//	Determine whether to “localize” content.
	let shouldLocalize = shouldLocalizeContentFromLink(includeLink);

    /*  When transcluding into a full page, delete various “metadata” sections
    	such as page-metadata, footnotes, etc.
     */
    if (transcludingIntoFullPage) {
    	let metadataSectionsSelector = [
    		"#page-metadata",
    		"#footnotes",
    		"#backlinks-section",
    		"#similars-section",
    		"#link-bibliography-section"
    	].join(", ");
    	wrapper.querySelectorAll(metadataSectionsSelector).forEach(section => {
    		section.remove();
    	});
    }

    //  ID transplantation.
    if (   includeLink.id > ""
        && includeLink.classList.contains("include-identify-not") == false
        && wrapper.querySelector(`#${(CSS.escape(includeLink.id))}`) == null) {
        let includedContentWrapperTagName = firstBlockOf(wrapper) != null
        									? "DIV"
        									: "SPAN";
        let includedContentWrapper = newElement(includedContentWrapperTagName, {
        	"id": includeLink.id,
        	"class": "include-wrapper-block"
        });
        includedContentWrapper.append(...wrapper.childNodes);
        wrapper.append(includedContentWrapper);
    }

	//	Heading level rectification.
	if (shouldLocalize) {
		let containingSectionLevel = sectionLevel(wrapper.closest("section")) ?? 0;
		let containedSectionLevel = sectionLevel(wrapper.querySelector("section")) ?? 1;
		let sectionLevelOffset = (containingSectionLevel - containedSectionLevel) + 1
		if (sectionLevelOffset > 0) {
			wrapper.querySelectorAll("section").forEach(section => {
				let oldLevel = sectionLevel(section);
				let newLevel = oldLevel + sectionLevelOffset;
				section.swapClasses([ `level${oldLevel}`, `level${newLevel}` ], 1);
				rewrapContents(section.querySelector(`h${oldLevel}`), `h${newLevel}`, { moveClasses: true })
			});
		}
	}

	//	Clear loading state of all include-links.
	Transclude.allIncludeLinksInContainer(wrapper).forEach(Transclude.clearLinkState);

    //  Fire GW.contentDidInject event.
	let flags = GW.contentDidInjectEventFlags.clickable;
	if (containingDocument == document)
		flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
	if (shouldLocalize)
		flags |= GW.contentDidInjectEventFlags.localize;
	GW.notificationCenter.fireEvent("GW.contentDidInject", {
		source: "transclude",
		contentType: contentTypeIdentifierForIncludeLink(includeLink),
		context: includeLink.eventInfo.context,
		container: wrapper,
		document: containingDocument,
		loadLocation: loadLocationForIncludeLink(includeLink),
		flags: flags,
		includeLink: includeLink
	});

	//	WITHIN-WRAPPER MODIFICATIONS END; OTHER MODIFICATIONS BEGIN

    //  Remove extraneous text node after link, if any.
    if (includeLink.nextSibling?.nodeType == Node.TEXT_NODE) {
        let cleanedNodeContents = Typography.processString(includeLink.nextSibling.textContent, Typography.replacementTypes.CLEAN);
        if (   cleanedNodeContents.match(/\S/) == null
        	|| cleanedNodeContents == ".")
	        includeLink.parentNode.removeChild(includeLink.nextSibling);
    }

    //  Remove include-link.
    includeLink.remove();

    //  Intelligent rectification of surrounding HTML structure.
    if (   includeLink.classList.contains("include-rectify-not") == false
    	&& firstBlockOf(wrapper) != null) {
		/*	Any kind of transcluded content can be contained within these types
			of block containers.
		 */
        let allowedParentSelector = [
        	"section",
        	"blockquote",
        	"div",
        	".include-wrapper"
        ];

		/*	If the transcluded content doesn’t contain entire sections (with
			headings), then it can be contained within some additional types of
			block container elements.
		 */
        if (wrapper.querySelector("section") == null)
        	allowedParentSelector.push("li", "figcaption");

		/*	If need be, shift the wrapper up until it is no longer contained
			within a forbidden type of parent element (maintaining strict node
			sequence in the process).
		 */
		allowedParentSelector = allowedParentSelector.join(", ");
        while (   wrapper.parentElement != null
               && wrapper.parentElement.matches(allowedParentSelector) == false
               && wrapper.parentElement.parentElement != null) {
			/*	Retain a reference to where in the node sequence of its current
				parent element the wrapper is, prior to shifting up.
			 */
            let nextNode = wrapper.nextSibling;

			/*	Shift the wrapper up one level in the tree, inserting it just
				after its current parent element.
			 */
            wrapper.parentElement.parentElement.insertBefore(wrapper, wrapper.parentElement.nextSibling);

			/*	If the now-former parent element of the wrapper is now empty
				(i.e., it contained only the wrapper, and no other substantive
				content), delete that element. The node sequence has not been
				altered by the up-shift, so nothing remains to do in this
				iteration.
			 */
            if (isNodeEmpty_metadataAware(wrapper.previousSibling)) {
                wrapper.previousSibling.remove();
                continue;
            }

			/*	If the wrapper was the last node within its former parent
				element, then, once again, the node sequence has not been
				altered by the up-shift, so nothing remains to do in this
				iteration.
			 */
            if (nextNode == null)
                continue;

			/*	The node sequence has been altered, and must be corrected.
				Nodes that came before the wrapper within its former parent
				element (which is now the wrapper’s previous sibling) will be
				kept where they are; nodes that came after the wrapper within
				its former parent element will be placed in a new element,
				which will be inserted as the wrapper’s next sibling.
			 */
            let firstPart = wrapper.previousSibling;
            /*	Create the second part (an element of the same kind as the
            	first part, containing the nodes that should come after the
            	wrapper).
             */
            let secondPart = newElement(firstPart.tagName);
            //	Ensure that both parts have the same classes.
            if (firstPart.className > "")
                secondPart.className = firstPart.className;
			//	Move requisite nodes from the first part to the second.
            while (nextNode) {
                let thisNode = nextNode;
                nextNode = nextNode.nextSibling;
                secondPart.appendChild(thisNode);
            }

			/*	If no substantive content remains in the wrapper’s previous
				sibling (i.e., it was the first non-empty node within its
				former parent element), delete the empty previous sibling.
			 */
            if (isNodeEmpty_metadataAware(firstPart) == true)
                firstPart.remove();

			/*	If the nodes that came after the wrapper within its former
				parent element (which are now housed within a new element, the
				wrapper’s next sibling) end up adding to no substantive content,
				delete them.
			 */
            if (isNodeEmpty_metadataAware(secondPart) == false)
                wrapper.parentElement.insertBefore(secondPart, wrapper.nextSibling);

			/*	If the transcluded content contains block elements, and the
				other content within the wrapper’s former parent element
				(before and/or after the wrapper in the node sequence) does
				not contain block elements, and also does not contain any links
				that are not present within the transcluded content, delete
				said other content, as it is surely extraneous.
			 */
			if (firstBlockOf(wrapper) != null) {
				[ firstPart, secondPart ].forEach(part => {
					if (firstBlockOf(part, null, true) != null)
						return;

					let unduplicatedLinksPresent = false;
					part.querySelectorAll("a").forEach(link => {
						if (wrapper.querySelector(`a[href='${CSS.escape(decodeURIComponent(link.href))}']`) == null)
							unduplicatedLinksPresent = true;
					});

					if (unduplicatedLinksPresent == false)
						part.remove();
				});
			}
        }
    }

	/*	Updates to page sections outside the wrapper, when transcluding into a
		full page (whether the base page or otherwise).
	 */
	if (transcludingIntoFullPage) {
		//	Distribute backlinks, when transcluding the backlinks section.
		if (   AuxLinks.auxLinksLinkType(includeLink) == "backlinks"
			&& wrapper.closest("#backlinks-section") != null)
			distributeSectionBacklinks(includeLink, wrapper);

		//  Update footnotes, when transcluding localizable content.
		if (shouldLocalize)
			updateFootnotesAfterInclusion(includeLink, wrapper);

		//  Update TOC, when transcluding localizable content into the base page.
		if (   containingDocument == document
			&& shouldLocalize)
			updatePageTOCIfNeeded(wrapper.parentElement);
	}

	//	Aggregate margin notes.
	aggregateMarginNotesIfNeededInDocument(containingDocument);

	//	Import style sheets, if need be.
	if (   containingDocument == document
		|| containingDocument instanceof ShadowRoot)
		importStylesAfterTransclusion(includeLink);

	//	OTHER MODIFICATIONS END

	//	Retain reference to nodes.
	let addedNodes = Array.from(wrapper.childNodes);
	let where = wrapper.parentElement;

    //  Unwrap.
    unwrap(wrapper);

   //  Prevent race condition, part II.
    includeLink.swapClasses([ "include-in-progress", "include-complete" ], 1);

    //  Fire event, if need be.
    if (includeLink.delayed) {
        GW.notificationCenter.fireEvent("Rewrite.contentDidChange", {
            source: "transclude",
            document: containingDocument,
            includeLink: includeLink,
            nodes: addedNodes,
            where: where
        });
    }

	//	Activity ends.
	endActivity();
}

/*****************************************************************************/
/*	Distributes, to each section of the page, all backlinks that point to that
	section specifically.
 */
function distributeSectionBacklinks(includeLink, mainBacklinksBlockWrapper) {
	let containingDocument = includeLink.eventInfo.document;
	let backlinksLoadLocation = loadLocationForIncludeLink(includeLink);

	let newlyConstructedSectionBacklinksBlockIncludeWrappers = [ ];

	mainBacklinksBlockWrapper.querySelectorAll(".backlink-context a[data-target-id]").forEach(backlinkContextLink => {
		let id = backlinkContextLink.dataset.targetId.split("--")[1];
		if (   id == ""
			|| id == undefined)
			return;

		let targetBlock = containingDocument.querySelector(`#${(CSS.escape(id))}`)?.closest("section, li.footnote");
		if (targetBlock == null)
			return;

		let backlinkEntry = backlinkContextLink.closest("li").cloneNode(true);
		let sectionBacklinksBlock = getBacklinksBlockForSectionOrFootnote(targetBlock, containingDocument);

		/*	If we are injecting into an existing section backlinks block, then
			a separate inject event must be fired for the distributed backlink.
		 */
		let sectionBacklinksBlockIncludeWrapper = sectionBacklinksBlock.closest(".section-backlinks-include-wrapper");
		if (sectionBacklinksBlockIncludeWrapper == null) {
			let backlinkEntryIncludeWrapper = newElement("DIV", { "class": "include-wrapper" });
			backlinkEntryIncludeWrapper.append(backlinkEntry);
			sectionBacklinksBlock.querySelector(".backlinks-list").append(backlinkEntryIncludeWrapper);

			//	Clear loading state of all include-links.
			Transclude.allIncludeLinksInContainer(backlinkEntryIncludeWrapper).forEach(Transclude.clearLinkState);

			//	Fire inject event.
			let flags = GW.contentDidInjectEventFlags.clickable;
			if (containingDocument == document)
				flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
			GW.notificationCenter.fireEvent("GW.contentDidInject", {
				source: "transclude.section-backlinks",
				contentType: "backlink",
				container: backlinkEntryIncludeWrapper,
				document: containingDocument,
				loadLocation: backlinksLoadLocation,
				flags: flags
			});

			unwrap(backlinkEntryIncludeWrapper);
		} else {
			sectionBacklinksBlock.querySelector(".backlinks-list").append(backlinkEntry);

			newlyConstructedSectionBacklinksBlockIncludeWrappers.push(sectionBacklinksBlockIncludeWrapper);
		}

		//	Update displayed count.
		updateBacklinksCountDisplay(sectionBacklinksBlock);
	});

	/*	For any new section backlinks blocks we constructed, we fire load and
		inject events for the entire section backlinks block (which also takes
		care of the individual backlink entries within).
	 */
	newlyConstructedSectionBacklinksBlockIncludeWrappers.forEach(sectionBacklinksBlockIncludeWrapper => {
		//	Clear loading state of all include-links.
		Transclude.allIncludeLinksInContainer(sectionBacklinksBlockIncludeWrapper).forEach(Transclude.clearLinkState);

		//	Fire load event.
		GW.notificationCenter.fireEvent("GW.contentDidLoad", {
			source: "transclude.section-backlinks",
			contentType: "backlink",
			container: sectionBacklinksBlockIncludeWrapper,
			document: containingDocument,
			loadLocation: backlinksLoadLocation
		});

		//	Fire inject event.
		let flags = GW.contentDidInjectEventFlags.clickable;
		if (containingDocument == document)
			flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
		GW.notificationCenter.fireEvent("GW.contentDidInject", {
			source: "transclude.section-backlinks",
			contentType: "backlink",
			container: sectionBacklinksBlockIncludeWrapper,
			document: containingDocument,
			loadLocation: backlinksLoadLocation,
			flags: flags
		});

		unwrap(sectionBacklinksBlockIncludeWrapper);
	});
}

/*****************************************************************************/
/*	Returns true iff a given document contains a style sheet identified by the
	given selector.
 */
function documentHasStyleSheet(doc, selector) {
	if (doc == document)
		return (doc.head.querySelector(selector) != null);
	else if (doc instanceof ShadowRoot)
		return (doc.body.querySelector(selector) != null);
	else
		return false;
}

/*****************************************************************************/
/*	Imports needed styles (<style> and/or <link> elements) after transclusion.
 */
function importStylesAfterTransclusion(includeLink) {
	let containingDocument = includeLink.eventInfo.document;
	let newContentSourceDocument = Transclude.dataProviderForLink(includeLink).cachedDocumentForLink(includeLink);

	if (newContentSourceDocument == null)
		return;

	let styleDefs = [
		[ "#mathjax-styles", ".mjpage" ]
	];

	styleDefs.forEach(styleDef => {
		let [ styleSheetSelector, elementSelector ] = styleDef;
		let stylesheet = newContentSourceDocument.querySelector(styleSheetSelector);
		if (   stylesheet
			&& (elementSelector
				? containingDocument.querySelector(elementSelector) != null
				: true)) {
			/*	Add stylesheet to root document in all cases, if need be.
				(If this is not done, then fonts will not be loaded.)
			 */
			if (documentHasStyleSheet(document, styleSheetSelector) == false)
				document.head.append(stylesheet.cloneNode(true));

			/*	If containing document is a shadow root, give it a copy of the
				style sheet also.
			 */
			if (containingDocument instanceof ShadowRoot)
				containingDocument.insertBefore(stylesheet.cloneNode(true), containingDocument.body);
		}
	});
}

/************************************************/
/*  Updates footnotes section after transclusion.
 */
//  Called by: includeContent
function updateFootnotesAfterInclusion(includeLink, newContentWrapper) {
    GWLog("updateFootnotesAfterInclusion", "transclude.js", 2);

	//	Do not when into sidenote.
	if (newContentWrapper.closest(".sidenote"))
		return;

	/*	Get the footnotes section associated with the transcluded content from
		the cached full document that the new content was sliced from.
	 */
	let newContentSourceDocument = Content.cachedDocumentForLink(includeLink);
	let newContentFootnotesSection = newContentSourceDocument?.querySelector("#footnotes");

    let citationsInNewContent = newContentWrapper.querySelectorAll(".footnote-ref");
    if (   citationsInNewContent.length == 0
        || newContentFootnotesSection == null)
        return;

    let containingDocument = includeLink.eventInfo.document;

	//	If the host page doesn’t have a footnotes section, construct one.
    let footnotesSection = containingDocument.querySelector(".markdownBody > #footnotes");
    if (footnotesSection == null) {
        //  Construct footnotes section.
        footnotesSection = newElement("SECTION", { "id": "footnotes", "class": "footnotes", "role": "doc-endnotes" });
        footnotesSection.append(newElement("HR"));
        footnotesSection.append(newElement("OL"));

        //  Wrap.
        let footnotesSectionWrapper = newElement("SPAN", { "class": "include-wrapper" });
        footnotesSectionWrapper.append(footnotesSection);

        //  Inject.
        let markdownBody = (containingDocument.querySelector("#markdownBody") ?? containingDocument.querySelector(".markdownBody"));
        markdownBody.append(footnotesSectionWrapper);

        //  Fire events.
        GW.notificationCenter.fireEvent("GW.contentDidLoad", {
            source: "transclude.footnotesSection",
            container: footnotesSectionWrapper,
            document: containingDocument,
            loadLocation: loadLocationForIncludeLink(includeLink)
        });
		GW.notificationCenter.fireEvent("GW.contentDidInject", {
			source: "transclude.footnotesSection",
			container: footnotesSectionWrapper,
			document: containingDocument,
            loadLocation: loadLocationForIncludeLink(includeLink),
            flags: 0
		});

        //  Update page TOC to add footnotes section entry.
        updatePageTOCIfNeeded(footnotesSectionWrapper);

        //  Unwrap.
        unwrap(footnotesSectionWrapper);
    }

	//	Construct wrapper.
    let newFootnotesWrapper = newElement("OL", { "class": "include-wrapper" });

	//	Add new footnotes to wrapper.
    citationsInNewContent.forEach(citation => {
		let citationNumber = Notes.noteNumber(citation);

        //  Original footnote (in source content/document).
        let footnote = newContentFootnotesSection.querySelector("#" + Notes.footnoteIdForNumber(citationNumber));

		//	Determine footnote’s source page, and its note number on that page.
		let sourcePagePathname = (footnote.dataset.sourcePagePathname ?? loadLocationForIncludeLink(includeLink).pathname);
		let originalNoteNumber = (footnote.dataset.originalNoteNumber ?? citationNumber);

		//	Check for already added copy of this footnote.
		let alreadyAddedFootnote = footnotesSection.querySelector(`li.footnote`
								 + `[data-source-page-pathname='${(CSS.escape(sourcePagePathname))}']`
								 + `[data-original-note-number='${originalNoteNumber}']`);

        //  Copy the footnote, or keep a pointer to it.
        citation.footnote = (alreadyAddedFootnote ?? newFootnotesWrapper.appendChild(document.importNode(footnote, true)));

		if (alreadyAddedFootnote == null) {
			//	Record source page and original number.
			citation.footnote.dataset.sourcePagePathname = sourcePagePathname;
			citation.footnote.dataset.originalNoteNumber = originalNoteNumber;
		}
    });

	//	Inject wrapper.
    footnotesSection.appendChild(newFootnotesWrapper);

	//	Fire GW.contentDidLoad event.
	GW.notificationCenter.fireEvent("GW.contentDidLoad", {
		source: "transclude.footnotes",
		container: newFootnotesWrapper,
		document: containingDocument,
		loadLocation: loadLocationForIncludeLink(includeLink)
	});

	//	Parent element of footnotes.
	let footnotesList = footnotesSection.querySelector("ol");

	//	Merge and unwrap.
	footnotesList.append(...(newFootnotesWrapper.children));

	//	Re-number citations/footnotes, and re-order footnotes.
	let footnoteNumber = 1;
	containingDocument.querySelectorAll(".footnote-ref").forEach(citation => {
		if (citation.closest(".sidenote"))
			return;

		let footnote = citation.footnote ?? footnotesSection.querySelector("#" + Notes.footnoteIdForNumber(Notes.noteNumber(citation)));
		if (footnote.parentElement == newFootnotesWrapper) {
			Notes.setCitationNumber(citation, Notes.noteNumber(footnote));
		} else {
			Notes.setCitationNumber(citation, footnoteNumber);
			Notes.setFootnoteNumber(footnote, footnoteNumber);

			newFootnotesWrapper.appendChild(footnote);

			footnoteNumber++;
		}
	});

	//	Fire inject event.
	let flags = (  GW.contentDidInjectEventFlags.clickable
				 | GW.contentDidInjectEventFlags.localize);
	if (containingDocument == document)
		flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
	GW.notificationCenter.fireEvent("GW.contentDidInject", {
		source: "transclude.footnotes",
		container: newFootnotesWrapper,
		document: containingDocument,
		loadLocation: loadLocationForIncludeLink(includeLink),
		flags: flags
	});

	//	Merge and unwrap (redux).
	footnotesList.append(...(newFootnotesWrapper.children));

	//	Discard wrapper.
	newFootnotesWrapper.remove();
}

/***********************************************************************/
/*  Handles interactions between include-links and content at locations.
 */
Transclude = {
    /*****************/
    /*  Configuration.
     */

    permittedClassNames: [
        "include",
        "include-annotation",
        "include-content",
        "include-strict",
        "include-lazy",
        "include-even-when-collapsed",
        "include-unwrap",
        "include-block-context",
        "include-rectify-not",
        "include-identify-not",
        "include-localize-not",

		/*	TEMPORARY.
				—SA 2024-12-31
		 */
		"include-replace-container"
    ],

    transcludeAnnotationsByDefault: true,

    defaultLoadViewportMargin: "105%",

    /******************************/
    /*  Detection of include-links.
     */

    isIncludeLink: (link) => {
        return link.classList.containsAnyOf(Transclude.permittedClassNames);
    },

    allIncludeLinksInContainer: (container) => {
        return Array.from(container.querySelectorAll("a[class*='include']")).filter(link => Transclude.isIncludeLink(link));
    },

	isContentTransclude: (link) => {
		if (Transclude.isIncludeLink(link) == false)
			return false;

        if ((   Transclude.hasFullAnnotation(link)
        	 || link.classList.contains("include-annotation")
        	 ) == false)
            return true;

		return ((   Transclude.transcludeAnnotationsByDefault
				 && Transclude.hasFullAnnotation(link))
				? link.classList.contains("include-content") == true
				: link.classList.contains("include-annotation") == false);
	},

    isAnnotationTransclude: (link) => {
		if (Transclude.isIncludeLink(link) == false)
			return false;

        if ((   Transclude.hasFullAnnotation(link)
        	 || link.classList.contains("include-annotation")
        	 ) == false)
            return false;

        return ((   Transclude.transcludeAnnotationsByDefault
        		 && Transclude.hasFullAnnotation(link))
                ? link.classList.contains("include-content") == false
                : link.classList.contains("include-annotation") == true);
    },

	hasAnnotation: (link) => {
		return (Annotations.isAnnotatedLink(link));
	},

	hasFullAnnotation: (link) => {
		return (Annotations.isAnnotatedLinkFull(link));
	},

    /**************/
    /*  Templating.
     */

	templates: { },

	doWhenTemplateLoaded: (templateName, loadHandler, loadFailHandler = null) => {
		let template = Transclude.templates[templateName];
		if (template == "LOADING_FAILED") {
			if (loadFailHandler)
				loadFailHandler();
		} else if (template) {
			loadHandler(template);
		} else {
			let loadOrFailHandler = (info) => {
				if (info.eventName == "Transclude.templateDidLoad") {
					loadHandler(Transclude.templates[templateName], true);

					GW.notificationCenter.removeHandlerForEvent("Transclude.templateLoadDidFail", loadOrFailHandler);
				} else {
					if (loadFailHandler)
						loadFailHandler(null, true);

					GW.notificationCenter.removeHandlerForEvent("Transclude.templateDidLoad", loadOrFailHandler);
				}
			};
			GW.notificationCenter.addHandlerForEvent("Transclude.templateDidLoad", loadOrFailHandler, {
				once: true,
				condition: (info) => info.templateName == templateName
			});
			GW.notificationCenter.addHandlerForEvent("Transclude.templateLoadDidFail", loadOrFailHandler, {
				once: true,
				condition: (info) => info.templateName == templateName
			});
		}
	},

	//	(string, string|object, object) => DocumentFragment
	fillTemplateNamed: (templateName, data, context, options) => {
		return fillTemplate(Transclude.templates[templateName], data, context, options);
	},

	standardTemplateFillContext: {
		linkTarget:   (GW.isMobile() ? "_self" : "_blank"),
		whichTab:     (GW.isMobile() ? "current" : "new"),
		tabOrWindow:  (GW.isMobile() ? "tab" : "window"),
	},

    /********************************/
    /*  Retrieved content processing.
     */

	//	Used in: Transclude.blockContext
	specificBlockElementSelectors: [
		[	".footnote",
			".sidenote"
			].join(", "),
		".aux-links-append",
		".epigraph"
	],

	generalBlockElementSelectors: [
		"figure",
		"li",
		"p",
		"blockquote",
		[	"section",
			".markdownBody > *",
// 			".include-wrapper-block",
			].join(", ")
	],

	notBlockElementSelector: [
		".annotation .data-field"
	].join(", "),

	blockContextMaximumLength: 250,

	//	Called by: Transclude.sliceContentFromDocument
	blockContext: (element, includeLink) => {
		let block = null;

		let specificBlockElementSelectors = [ ...Transclude.specificBlockElementSelectors ];
		let generalBlockElementSelectors = [ ...Transclude.generalBlockElementSelectors ];

		/*	Parse and process block context options (if any) specified by the
			include-link. (See documentation for the .include-block-context
			class for details.)
		 */
		let options = parsePipedOptions(includeLink.dataset.blockContextOptions);

		//	Expanded mode.
		if (options?.includes("expanded")) {
			//	Remove `p`, to prioritize selectors for enclosing elements.
			generalBlockElementSelectors.remove("p");

			//	Re-add `p` as a last-resort selector.
			generalBlockElementSelectors.push("p");
		}

		//	Look for specific block element types (ignoring exclusions).
		for (let selector of specificBlockElementSelectors)
			if (block = element.closest(selector))
				break;

		/*	Look for general block element types (respecting exclusions and
			length limit).
		 */
		if (block == null) {
			for (let selector of generalBlockElementSelectors) {
				if (   (block = element.closest(selector) ?? block)
					&& block.textContent.trim().length < Transclude.blockContextMaximumLength
					&& block.matches(Transclude.notBlockElementSelector) == false) {
					break;
				}
			}
		}

		if (block == null)
			return null;

		let blockContext = newDocument([ "BLOCKQUOTE", "LI" ].includes(block.tagName)
									   ? block.childNodes
									   : block);

		/*	Remove any child sections. (We know the target element is not
			contained within them, because if it were, then *that* section would
			be the block context. So, any child sections are necessarily
			extraneous.)

			(Do not do this if the section itself is the target element.)
		 */
		if (   block.tagName == "SECTION"
			&& element != block) {
			blockContext.querySelectorAll("section section").forEach(childSection => {
				childSection.remove();
			});
		}

		return blockContext;
	},

    //  Called by: Transclude.sliceContentFromDocument
	isSliceable: (includeLink) => {
		let dataProvider = Transclude.dataProviderForLink(includeLink);
		switch (dataProvider) {
		case Content:
			return Content.contentTypeForLink(includeLink).isSliceable;
		case Annotations:
			return true;
		}
	},

    //  Called by: Transclude.transclude
    sliceContentFromDocument: (sourceDocument, includeLink) => {
		//	Check if slicing is permitted.
		if (Transclude.isSliceable(includeLink) == false)
			return newDocument(sourceDocument);

        //  If it’s a full page, extract just the page content.
        let pageContent = sourceDocument.querySelector("#markdownBody") ?? sourceDocument.querySelector("body");
        let content = pageContent ? newDocument(pageContent.childNodes) : newDocument(sourceDocument);

        //  If the link’s anchor(s) specify part of the page, extract that.
        let anchors = anchorsForLink(includeLink);
        if (anchors.length == 2) {
            //  PmWiki-like transclude range syntax.

			//	Start element.
			let startElement = null;
			if (anchors[0].length > 1) {
				startElement = content.querySelector(selectorFromHash(anchors[0]));

				//	If specified but missing, transclude nothing.
				if (startElement == null)
					return newDocument();
			}

			//	End element.
			let endElement = null;
			if (anchors[1].length > 1) {
				endElement = content.querySelector(selectorFromHash(anchors[1]));

				//	If specified but missing, transclude nothing.
				if (endElement == null)
					return newDocument();
			}

            /*  If both ends of the range are unspecified, we return the entire
                content.
             */
            if (   startElement == null
                && endElement == null)
                return content;

            /*  If both ends of the range exist, but the end element
                doesn’t follow the start element, we return nothing.
             */
            if (   startElement
                && endElement
                && (   startElement == endElement
                    || startElement.compareDocumentPosition(endElement) & Node.DOCUMENT_POSITION_PRECEDING))
                return newDocument();

            //  Slice.
            let slicedContent = newDocument();

            if (startElement == null) {
                //  From start to id.
                slicedContent.appendChild(content);

                let currentNode = endElement;
                while (currentNode != slicedContent) {
                    while (currentNode.nextSibling) {
                        currentNode.nextSibling.remove();
                    }
                    currentNode = currentNode.parentNode;
                }
                endElement.remove();
            } else if (endElement == null) {
                //  From id to end.
                let nodesToAppend = [ startElement ];

                let currentNode = startElement;
                while (currentNode.parentNode) {
                    while (currentNode.nextSibling) {
                        nodesToAppend.push(currentNode.nextSibling);
                        currentNode = currentNode.nextSibling;
                    }
                    currentNode = currentNode.parentNode;
                }

                nodesToAppend.forEach(node => { slicedContent.appendChild(node); });
            } else {
                //  From id to id.
                let nodesToAppend = [ ];

                /*  Node which contains both start and end elements
                    (which might be the root DocumentFragment).
                 */
                let sharedAncestor = startElement.parentNode;
                while (!sharedAncestor.contains(endElement))
                    sharedAncestor = sharedAncestor.parentNode;

                let currentNode = startElement;

                /*  The branch of the tree containing the start element
                    (if it does not also contain the end element).
                 */
                while (currentNode.parentNode != sharedAncestor) {
                    while (currentNode.nextSibling) {
                        nodesToAppend.push(currentNode.nextSibling);
                        currentNode = currentNode.nextSibling;
                    }
                    currentNode = currentNode.parentNode;
                }

                //  There might be intervening branches.
                if (!currentNode.contains(endElement)) {
                    while (!currentNode.nextSibling.contains(endElement)) {
                        currentNode = currentNode.nextSibling;
                        nodesToAppend.push(currentNode);
                    }
                    currentNode = currentNode.nextSibling;
                }

                //  The branch of the tree containing the end element.
                if (currentNode != endElement) {
                    let endBranchOrigin = currentNode;
                    currentNode = endElement;
                    while (currentNode != endBranchOrigin) {
                        while (currentNode.nextSibling) {
                            currentNode.nextSibling.remove();
                        }
                        currentNode = currentNode.parentNode;
                    }
                    endElement.remove();
                    nodesToAppend.push(endBranchOrigin);
                }

                //  Insert the start element, if not there already.
                if (!nodesToAppend.last.contains(startElement))
                    nodesToAppend.splice(0, 0, startElement);

                //  Assemble.
                nodesToAppend.forEach(node => { slicedContent.appendChild(node); });
            }

            content = slicedContent;
        } else if (isAnchorLink(includeLink)) {
            //  Simple element tranclude.
            let targetElement = targetElementInDocument(includeLink, content);
            if (targetElement) {
				//	Optional block context.
            	/*	Check for whether the target element is *itself* an
            		include-link which will bring in a content block. If so,
            		do not include any *additional* block context, even if
            		the include-link we’re currently processing requests it!
            	 */
				let isBlockTranscludeLink = (   Transclude.isIncludeLink(targetElement)
											 && (   targetElement.classList.contains("include-block-context")
												 || (   targetElement.id > ""
													 && targetElement.classList.contains("include-identify-not") == false)));

				/*	We do not want to transclude annotations within backlink
					context. So, we will transform an annotation include link
					in such a case into a normal link, and include its block
					context normally.
				 */
				if (   isBlockTranscludeLink
					&& Transclude.isAnnotationTransclude(targetElement)
					&& includeLink.closest(".backlink-context") != null) {
					Transclude.clearLinkState(targetElement);
					Transclude.stripIncludeClassesFromLink(targetElement);
					isBlockTranscludeLink = false;
				}

				if (   includeLink.classList.contains("include-block-context")
					&& isBlockTranscludeLink == false) {
					content = Transclude.blockContext(targetElement, includeLink);
					if (content) {
						//	Mark targeted element, for styling purposes.
						highlightTargetElementInDocument(includeLink, content);
					} else {
						content = newDocument(targetElement);
					}
				} else {
					content = newDocument(targetElement);
				}
            } else {
            	content = newDocument();

            	reportBrokenAnchorLink(includeLink);
            }
        }

		//	Apply `data-include-selector-not` attribute.
		if (includeLink.dataset.includeSelectorNot) {
			/*	Parse and process selector inclusion options (if any) specified
				by the include-link. (See documentation for selector-based
				inclusion for details.)
			 */
			let options = parsePipedOptions(   includeLink.dataset.includeSelectorNotOptions
											|| includeLink.dataset.includeSelectorGeneralOptions);
			let elementsToExclude = [ ];
			if (options?.includes("first")) {
				let element = content.querySelector(includeLink.dataset.includeSelectorNot);
				if (element)
					elementsToExclude.push(element);
			} else {
				content.querySelectorAll(includeLink.dataset.includeSelectorNot).forEach(element => {
					if (elementsToExclude.findIndex(x => x.contains(element)) === -1)
						elementsToExclude.push(element);
				});
			}
			elementsToExclude.forEach(element => {
				element.remove();
			});
		}

		//	Apply `data-include-selector` attribute.
		if (includeLink.dataset.includeSelector) {
			/*	Parse and process selector inclusion options (if any) specified
				by the include-link. (See documentation for selector-based
				inclusion for details.)
			 */
			let options = parsePipedOptions(   includeLink.dataset.includeSelectorOptions
											|| includeLink.dataset.includeSelectorGeneralOptions);
			let elementsToInclude = [ ];
			if (options?.includes("first")) {
				let element = content.querySelector(includeLink.dataset.includeSelector);
				if (element)
					elementsToInclude.push(element);
			} else {
				content.querySelectorAll(includeLink.dataset.includeSelector).forEach(element => {
					if (elementsToInclude.findIndex(x => x.contains(element)) === -1)
						elementsToInclude.push(element);
				});
			}
			content.replaceChildren(...elementsToInclude);
		}

        return content;
    },

    /*************************/
    /*  Include-link handling.
     */

	dataProviderNameForLink: (includeLink) => {
		return (Transclude.isAnnotationTransclude(includeLink)
				? "Annotations"
				: "Content");
	},

	dataProviderForLink: (includeLink) => {
		return window[Transclude.dataProviderNameForLink(includeLink)];
	},

	doWhenDataProviderLoaded: (includeLink, loadHandler) => {
		GW.notificationCenter.addHandlerForEvent(`${(Transclude.dataProviderNameForLink(includeLink))}.didLoad`,
												 loadHandler,
												 { once: true });
	},

	//  Enable alias classes for various forms of includes.
	includeLinkAliasTransforms: [ ],

	addIncludeLinkAliasClass: (aliasClass, linkTransform) => {
		Transclude.permittedClassNames.push(aliasClass);
		Transclude.includeLinkAliasTransforms.push([ aliasClass, linkTransform ]);
	},

	resolveIncludeLinkAliasClasses: (includeLink) => {
		Transclude.includeLinkAliasTransforms.forEach(alias => {
			let [ aliasClass, linkTransform ] = alias;
			if (includeLink.classList.contains(aliasClass)) {
				linkTransform(includeLink);
				includeLink.classList.remove(aliasClass);
			}
		});
	},

    //  Called by: Transclude.transclude
    //  Called by: Transclude.triggerTranscludesInContainer
    //  Called by: handleTranscludes (rewrite function)
    transclude: (includeLink, now = false) => {
        GWLog("Transclude.transclude", "transclude.js", 2);

		//	Resolve alias classes.
		Transclude.resolveIncludeLinkAliasClasses(includeLink);

		/*  We don’t retry failed loads, nor do we replicate ongoing loads.
         */
        if (   now == false
        	&& includeLink.classList.containsAnyOf([
        	"include-loading",
            "include-loading-failed"
        ])) return;

		/*	We do not attempt to transclude annotation transclude links which
			do not (according to their set-by-the-server designation) actually
			have any annotation.
		 */
		if (   Transclude.isAnnotationTransclude(includeLink)
			&& Transclude.hasAnnotation(includeLink) == false)
			return;

        /*  By default, includes within collapse blocks only get transcluded
            if/when the collapse block is expanded.
         */
        if (   now == false
            && isWithinCollapsedBlock(includeLink)
            && includeLink.classList.contains("include-strict") == false
            && includeLink.classList.contains("include-even-when-collapsed") == false) {
            includeLink.delayed = true;
            GW.notificationCenter.addHandlerForEvent("Collapse.collapseStateDidChange", (info) => {
                Transclude.transclude(includeLink);
            }, {
            	once: true,
            	condition: (info) => (isWithinCollapsedBlock(includeLink) == false)
            });

            return;
        }

        //  Set loading state.
        Transclude.setLinkStateLoading(includeLink);

        //  Transclusion is lazy by default.
        if (   now == false
            && includeLink.classList.contains("include-strict") == false) {
            includeLink.delayed = true;
            requestIdleCallback(() => {
                lazyLoadObserver(() => {
                    Transclude.transclude(includeLink, true);
                }, includeLink, {
                	root: scrollContainerOf(includeLink),
                	rootMargin: (includeLink.classList.contains("include-lazy")
                				 ? "0px"
                				 : Transclude.defaultLoadViewportMargin)
                });
            });

            return;
        }

		//	Get data provider.
		let dataProvider = Transclude.dataProviderForLink(includeLink);
        if (dataProvider == null) {
			/*  If data provider is not loaded, wait until it loads to attempt
				transclusion.
			 */
			includeLink.delayed = true;
			Transclude.doWhenDataProviderLoaded(includeLink, (info) => {
				Transclude.transclude(includeLink, true);
			});

			return;
        }

		//	Activity begins.
		beginActivity();

		//	Request data load, if need be.
		if (dataProvider.cachedDataExists(includeLink) == false) {
			dataProvider.load(includeLink);
	        includeLink.delayed = true;
		}

		//	When data loads (or if it is already loaded), transclude.
		let processData = (template) => {
			//	Reference data.
			let referenceData = dataProvider.referenceDataForLink(includeLink);

			let content = null;
			if (template) {
				//	Template fill context.
				let context = Object.assign({ }, Transclude.standardTemplateFillContext, referenceData, templateDataFromHTML(includeLink));

				//	Template fill options.
				let options = {
					fireContentLoadEvent: true,
					loadEventInfo: {
						source: "transclude",
						contentType: contentTypeIdentifierForIncludeLink(includeLink),
						includeLink: includeLink,
						loadLocation: loadLocationForIncludeLink(includeLink)
					}
				};

				//	Fill template.
				content = fillTemplate(template, referenceData.content, context, options);
			} else if (referenceData.content instanceof DocumentFragment) {
				content = referenceData.content;
			}

			//	Slice and include, or else handle failure.
			if (content) {
				includeContent(includeLink, Transclude.sliceContentFromDocument(content, includeLink));
			} else {
				Transclude.setLinkStateLoadingFailed(includeLink);

				//	Send request to record failure in server logs.
				GWServerLogError(includeLink.href + `--include-template-fill-failed`,
								 "failed include template fill");
			}
		};
		dataProvider.waitForDataLoad(includeLink, (link) => {
		   	//	Load success handler.

			/*	If a template is specified by name, then we’ll need to make sure
				that it’s loaded before we can fill it with data.
			 */
			let referenceData = dataProvider.referenceDataForLink(includeLink);
			let templateName = includeLink.dataset.includeTemplate || referenceData.template;
			if (templateName) {
				while (templateName.startsWith("$"))
					templateName = referenceData[templateName.slice(1)] || referenceData.template;

				Transclude.doWhenTemplateLoaded(templateName, (template, delayed) => {
					if (delayed)
						includeLink.delayed = true;

					processData(template);
				}, (delayed) => {
					Transclude.setLinkStateLoadingFailed(includeLink);

					//	Send request to record failure in server logs.
					GWServerLogError(templateName + `--include-template-load-failed`,
									 "failed include template load");
				});
			} else {
				processData();
			}
		}, (link) => {
		   	//	Load fail handler.
		   	endActivity();

			/*  If we’ve already tried and failed to load the content, we
				will not try loading again, and just show a “loading failed”
				message.
			 */
			Transclude.setLinkStateLoadingFailed(includeLink);

			//  Send request to record failure in server logs.
			GWServerLogError(includeLink.href + `--transclude-failed`,
							 "failed transclude");
		});
    },

    /*****************/
    /*  Misc. helpers.
     */

    //  Called by: "beforeprint" listener (rewrite.js)
    triggerTranscludesInContainer: (container, eventInfo) => {
        Transclude.allIncludeLinksInContainer(container).forEach(includeLink => {
        	Transclude.triggerTransclude(includeLink, eventInfo);
        });
    },


	/*	Available option fields (all optional):

		doWhenDidLoad
		doWhenDidLoadOptions
		doWhenDidInject
		doWhenDidInjectOptions
	 */
	triggerTransclude: (includeLink, eventInfo, options) => {
		options = Object.assign({
			doWhenDidLoad: null,
			doWhenDidInject: null
		}, options);

		if (eventInfo)
			includeLink.eventInfo = eventInfo;

		//	If a load and/or inject handler is provided, add them.
		if (   options.doWhenDidLoad != null
			|| options.doWhenDidInject != null) {
			let handlerOptions = {
				once: true,
				condition: (info) => (info.includeLink == includeLink)
			};

			if (options.doWhenDidLoad != null) {
				GW.notificationCenter.addHandlerForEvent("GW.contentDidLoad", (info) => {
					options.doWhenDidLoad(info);
				}, Object.assign(handlerOptions, options.doWhenDidLoadOptions));
			}

			if (options.doWhenDidInject != null) {
				GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (info) => {
					options.doWhenDidInject(info);
				}, Object.assign(handlerOptions, options.doWhenDidInjectOptions));
			}
		}

		Transclude.transclude(includeLink, true);
	},

    /********************/
    /*  Loading spinners.
     */

    //  Called by: Transclude.transclude
    setLinkStateLoading: (link) => {
        if (Transclude.isIncludeLink(link) == false)
            return;

		//	Designate loading state.
        link.classList.add("include-loading");

		//	Intelligently add loading spinner, unless override class set.
		if (link.classList.containsAnyOf([ "include-spinner", "include-spinner-not" ]) == false) {
			/*	Add loading spinner for link bibliography entries and also any
				include-link not within a collapsed block.
			 */
			if (isWithinCollapsedBlock(link) == false) {
				link.classList.add("include-spinner");
			} else {
				let containingAuxLinksBlock = link.closest(".aux-links-list, .aux-links-append");
				if (   containingAuxLinksBlock
					&& containingAuxLinksBlock.classList.contains("link-bibliography-list")) {
					link.classList.add("include-spinner");
				}
			}
		}

		//	Disable link icon, if loading spinner present.
        if (   link.classList.contains("include-spinner")
        	&& link.textContent > "")
            link.classList.add("icon-not");

		//	Designate dark mode inversion.
		if (link.classList.contains("include-spinner"))
			link.classList.add("dark-mode-invert");

		//	Disable normal link functionality.
        link.onclick = () => { return false; };

		//	Save tooltip and set temporary one.
		if (link.savedTitle == null) {
			link.savedTitle = link.title ?? "";
			link.title = "Content is loading. Please wait.";
		}
    },

    //  Called by: Transclude.transclude
    setLinkStateLoadingFailed: (link) => {
        if (Transclude.isIncludeLink(link) == false)
            return;

		//	Record load failure.
        link.swapClasses([ "include-loading", "include-loading-failed" ], 1);

		//	Revert to normal link functionality.
		Transclude.resetLinkBehavior(link);

        //  Fire event, if need be.
        if (link.delayed) {
            GW.notificationCenter.fireEvent("Rewrite.contentDidChange", {
                source: "transclude.loadingFailed",
                document: link.eventInfo.document,
	            includeLink: link,
                nodes: [ link ]
            });
        }
    },

    //  Called by: includeContent
	clearLinkState: (link) => {
        if (Transclude.isIncludeLink(link) == false)
            return;

		//	Clear classes.
		link.classList.remove("include-loading", "include-loading-failed");

		//	Revert to normal link functionality.
		Transclude.resetLinkBehavior(link);
	},

	//	Called by: Transclude.setLinkStateLoadingFailed
	//	Called by: Transclude.clearLinkState
	resetLinkBehavior: (link) => {
		//	Re-enable link icon.
        if (link.textContent > "")
            link.classList.remove("icon-not");

		//	Re-enable normal link behavior.
        link.onclick = null;

		//	Replace normal tooltip.
		link.title = link.savedTitle;
		link.savedTitle = null;
	},

	//	Called by: Transclude.sliceContentFromDocument
	stripIncludeClassesFromLink: (link) => {
		link.classList.remove(...Transclude.permittedClassNames, "include-spinner", "include-spinner-not");
	}
};

/****************************/
/*  Process transclude-links.
 */
addContentLoadHandler(GW.contentLoadHandlers.handleTranscludes = (eventInfo) => {
    GWLog("handleTranscludes", "transclude.js", 1);

    Transclude.allIncludeLinksInContainer(eventInfo.container).forEach(includeLink => {
		//	Store a reference to the load event info.
		includeLink.eventInfo = eventInfo;

        //  Transclude now or maybe later.
        Transclude.transclude(includeLink);
    });
}, "transclude");

/*************************************************************/
/*	Re-process when injecting. (Necessary for cloned content.)
 */
addContentInjectHandler(GW.contentInjectHandlers.handleTranscludes = GW.contentLoadHandlers.handleTranscludes, "rewrite");

/******************************************/
/*	Add various include-link alias classes.
 */

/*=============================================*/
/*	.include-block-context-expanded
		`class="include-block-context"`
		`data-block-context-options="expanded"`
 */
Transclude.addIncludeLinkAliasClass("include-block-context-expanded", (includeLink) => {
	includeLink.classList.add("include-block-context");
	includeLink.dataset.blockContextOptions = "expanded";
});

/*========================================================*/
/*	.include-annotation-partial
		`class="include-annotation"`
		`data-include-selector-not=".annotation-abstract, .file-includes, figure, .data-field-separator"`
		`data-template-fields="annotationClassSuffix:$"`
		`data-annotation-class-suffix="-partial"`
 */
Transclude.addIncludeLinkAliasClass("include-annotation-partial", (includeLink) => {
	includeLink.classList.add("include-annotation");
	includeLink.dataset.includeSelectorNot = [
		...((includeLink.dataset.includeSelectorNot ?? "").split(",").filter(x => x)),
		".annotation-abstract",
		".file-includes",
		"figure",
		".data-field-separator"
	].unique().join(",");
	includeLink.dataset.templateFields = [
		...((includeLink.dataset.templateFields ?? "").split(",").filter(x => x)),
		"annotationClassSuffix:$"
	].unique().join(",");
	includeLink.dataset.annotationClassSuffix = "-partial";
});

/*====================================================================*/
/*	.include-annotation-core
		`class="include-annotation"`
		`data-include-selector=".annotation-abstract, .file-includes"`
 */
Transclude.addIncludeLinkAliasClass("include-annotation-core", (includeLink) => {
	includeLink.classList.add("include-annotation");
	includeLink.dataset.includeSelector = [
		...((includeLink.dataset.includeSelector ?? "").split(",").filter(x => x)),
		".annotation-abstract",
		".file-includes"
	].unique().join(", ");
});

/*==========================================================*/
/*	.include-content-core
		`class="include-content"
		`data-include-selector-not="#footnotes, #backlinks-section,
			#similars-section, #link-bibliography-section,
			#page-metadata .link-tags, #page-metadata .page-metadata-fields"`
 */
Transclude.addIncludeLinkAliasClass("include-content-core", (includeLink) => {
	includeLink.classList.add("include-content");
	includeLink.dataset.includeSelectorNot = [
		...((includeLink.dataset.includeSelectorNot ?? "").split(",").filter(x => x)),
		"#footnotes",
		"#backlinks-section",
		"#similars-section",
		"#link-bibliography-section",
		"#page-metadata .link-tags",
		"#page-metadata .page-metadata-fields"
	].unique().join(", ");
});

/*==========================================================*/
/*	.include-content-no-header
		`class="include-unwrap"`
		`data-include-selector-not="h1, h2, h3, h4, h5, h6"`
		`data-include-selector-not-options="first"`
 */
Transclude.addIncludeLinkAliasClass("include-content-no-header", (includeLink) => {
	includeLink.classList.add("include-unwrap");
	includeLink.dataset.includeSelectorNot = [
		...((includeLink.dataset.includeSelectorNot ?? "").split(",").filter(x => x)),
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6"
	].unique().join(", ");
	includeLink.dataset.includeSelectorNotOptions = "first";
});

/*==========================================================*/
/*	.include-caption-not
		`data-include-selector-not=".caption-wrapper"`
 */
Transclude.addIncludeLinkAliasClass("include-caption-not", (includeLink) => {
	includeLink.dataset.includeSelectorNot = [
		...((includeLink.dataset.includeSelectorNot ?? "").split(",").filter(x => x)),
		".caption-wrapper"
	].unique().join(", ");
});
Transclude.templates = {
	"annotation-blockquote-inside": `<div class="annotation<{annotationClassSuffix}>">
	<p class="data-field title <[IF authorDateAux]>author-date-aux<[IFEND]>">
		<a 
		   class="<{titleLinkClass}>"
		   title="Open <<{titleLinkHref}>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{titleLinkHref}>"
		   target="<{linkTarget}>"
		   <{titleLinkDataAttributes}>
			   ><{title}></a>\\
		<[IF [ abstract | fileIncludes ] & !authorDateAux ]><span class="data-field-separator">:</span><[IFEND]>\\
		<[IF authorDateAux]><[IF2 author]>,\\ <[IF2END]><{authorDateAux}><[IF2 [ abstract | fileIncludes ] ]><span class="data-field-separator">:</span><[IF2END]><[IFEND]>
	</p>
	<[IF abstract]>
	<blockquote class="data-field annotation-abstract">
		<[IF2 thumbnailFigure]>
		<{thumbnailFigure}>
		<[IF2END]>
		<{abstract}>
		<[IF2 fileIncludes]>
		<div class="data-field file-includes"><{fileIncludes}></div>
		<[IF2END]>
	</blockquote>
	<[ELSE]>
		<[IF2 fileIncludes]>
		<div class="data-field file-includes"><{fileIncludes}></div>
		<[IF2END]>
	<[IFEND]>
</div>`,
	"annotation-blockquote-not": `<div class="annotation<{annotationClassSuffix}>">
	<[IF thumbnailFigure]>
	<{thumbnailFigure}>
	<[IFEND]>
	<p class="data-field title">
		<a 
		   class="<{titleLinkClass}>"
		   title="Open <<{titleLinkHref}>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{titleLinkHref}>"
		   target="<{linkTarget}>"
		   <{titleLinkDataAttributes}>
			   ><{title}></a>
	</p>
	<[IF authorDateAux]>
	<p class="data-field author-date-aux"><{authorDateAux}></p>
	<[IFEND]>
	<[IF abstract]>
	<div class="data-field annotation-abstract"><{abstract}></div>
	<[IFEND]>
	<[IF fileIncludes]>
	<div class="data-field file-includes"><{fileIncludes}></div>
	<[IFEND]>
</div>`,
	"annotation-blockquote-outside": `<blockquote class="annotation<{annotationClassSuffix}>">
	<[IF thumbnailFigure]>
	<{thumbnailFigure}>
	<[IFEND]>
	<p class="data-field title">
		<a 
		   class="<{titleLinkClass}>"
		   title="Open <<{titleLinkHref}>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{titleLinkHref}>"
		   target="<{linkTarget}>"
		   <{titleLinkDataAttributes}>
			   ><{title}></a>
	</p>
	<[IF authorDateAux]>
	<p class="data-field author-date-aux"><{authorDateAux}></p>
	<[IFEND]>
	<[IF abstract]>
	<div class="data-field annotation-abstract"><{abstract}></div>
	<[IFEND]>
	<[IF fileIncludes]>
	<div class="data-field file-includes"><{fileIncludes}></div>
	<[IFEND]>
</blockquote>`,
	"github-issue-blockquote-not": `<div class="content-transform <{contentTypeClass}>">
	<div class="data-field issue-content"><{issueContent}></div>
</div>`,
	"github-issue-blockquote-outside": `<blockquote class="content-transform <{contentTypeClass}>">
	<div class="data-field issue-content"><{issueContent}></div>
</blockquote>`,
	"pop-frame-title-standard": `<a
	class="popframe-title-link"
	href="<{popFrameTitleLinkHref}>"
	title="Open <<{popFrameTitleLinkHref}>> in <{whichTab}> <{tabOrWindow}>."
	target="<{linkTarget}>"
		><{popFrameTitle}></a>`,
	"tweet-blockquote-not": `<div class="content-transform <{contentTypeClass}>">
	<p class="data-field tweet-links">
		<a 
		   class="<{authorLinkClass}>"
		   title="Open <<{authorLinkHref}>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{titleLinkHref}>"
		   target="<{linkTarget}>"
		   <{authorLinkIconMetadata}>
			   ><{authorPlusAvatar}></a>\\
		on \\
		<a
		   class="<{tweetLinkClass}>" 
		   title="Open <<{tweetLinkHref>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{tweetLinkHref}>" 
		   <{archivedTweetURLDataAttribute}> 
		   <{tweetLinkIconMetadata}>
		   	   ><{tweetDate}></a>
	</p>
	<div class="data-field tweet-content"><{tweetContent}></div>
</div>`,
	"tweet-blockquote-outside": `<blockquote class="content-transform <{contentTypeClass}>">
	<p class="data-field tweet-links">
		<a 
		   class="<{authorLinkClass}>"
		   title="Open <<{authorLinkHref}>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{authorLinkHref}>"
		   target="<{linkTarget}>"
		   <{authorLinkIconMetadata}>
			   ><{authorPlusAvatar}></a>\\
		on \\
		<a
		   class="<{tweetLinkClass}>" 
		   title="Open <<{tweetLinkHref>> in <{whichTab}> <{tabOrWindow}>"
		   href="<{tweetLinkHref}>" 
		   <{archivedTweetURLDataAttribute}> 
		   <{tweetLinkIconMetadata}>
		   	   ><{tweetDate}></a>
	</p>
	<div class="data-field tweet-content"><{tweetContent}></div>
</blockquote>`,
	"wikipedia-entry-blockquote-inside": `<div class="content-transform <{contentTypeClass}>">
	<p class="data-field title"><{titleLine}>:</p>
	<blockquote class="data-field entry-content">
		<[IF thumbnailFigure]>
		<{thumbnailFigure}>
		<[IFEND]>
		<{entryContent}>
	</blockquote>
</div>`,
	"wikipedia-entry-blockquote-not": `<div class="content-transform <{contentTypeClass}>">
	<[IF thumbnailFigure]>
	<{thumbnailFigure}>
	<[IFEND]>
	<p class="data-field title"><{titleLine}></p>
	<div class="data-field entry-content"><{entryContent}></div>
</div>`,
	"wikipedia-entry-blockquote-title-not": `<div class="content-transform <{contentTypeClass}>">
	<blockquote class="data-field entry-content">
		<[IF thumbnailFigure]>
		<{thumbnailFigure}>
		<[IFEND]>
		<{entryContent}>
	</blockquote>
</div>`,
};
// popups.js: standalone Javascript library for creating 'popups' which display link metadata (typically, title/author/date/summary), for extremely convenient reference/abstract reading.
// Author: Said Achmiz, Shawn Presser (mobile & Youtube support)
// Date: 2019-09-12
// When:
// license: MIT (derivative of footnotes.js, which is PD)

// Popups are inspired by Wikipedia's augmented tooltips (originally implemented as editor-built extensions, now available to all readers via https://www.mediawiki.org/wiki/Page_Previews ). Whenever any such link is mouse-overed by the user, popups.js will pop up a large tooltip-like square with the contents of the attributes. This is particularly intended for references, where it is extremely convenient to autopopulate links such as to Arxiv.org/Biorxiv.org/Wikipedia with the link's title/author/date/abstract, so the reader can see it instantly. Links to 'reverse citations' are provided as much as possible: links with DOIs go to a Semantic Scholar search engine query for that DOI, which prioritizes meta-analyses & systematic reviews to provide context for any given paper (particularly whether it has failed to replicate or otherwise been debunked); for URLs ending in 'PDF' which probably have Semantic Scholar entries, they go to a title search; and for all other URLs, a Google search using the obscure `link:` operator is provided.. For more details, see `LinkMetadata.hs`.

// On mobile, clicking on links (as opposed to hovering over links on desktop) will bring up the annotation or video; another click on it or the popup will then go to it. A click outside it de-activates it.

// For an example of a Hakyll library which generates annotations for Wikipedia/Biorxiv/Arxiv/PDFs/arbitrarily-defined links, see <https://gwern.net/static/build/LinkMetadata.hs>; for examples, see the links in <https://gwern.net/lorem-links>

Extracts = {
    /******************/
    /*  Infrastructure.
     */

    rootDocument: document,

    //  Can be ‘Popups’ or ‘Popins’, currently.
    popFrameProviderName: null,
    //  Can be the Popups or Popins object, currently.
    popFrameProvider: null,

    /***********/
    /*  General.
     */

	//	Called by: Extracts.removeTargetsWithin
	restoreTarget: (target) => {
		//  Restore title attribute, if any.
		if (target.dataset.attributeTitle) {
			target.title = target.dataset.attributeTitle;
			target.removeAttribute("data-attribute-title");
		}

		target.classList.remove("has-content", "has-annotation", "has-annotation-partial");
	},

    //  Called by: Extracts.cleanup
    removeTargetsWithin: (container) => {
        GWLog("Extracts.removeTargetsWithin", "extracts.js", 1);

		container.querySelectorAll(Extracts.config.targetElementsSelector).forEach(target => {
			if (   target.matches(Extracts.config.excludedElementsSelector)
				|| target.closest(Extracts.config.excludedContainerElementsSelector) != null)
				return;

			if (Extracts.testTarget(target) == false)
				return;

			Extracts.restoreTarget(target);

			Extracts.popFrameProvider.removeTarget(target);
		});
    },

    //  Called by: extracts-options.js
    cleanup: () => {
        GWLog("Extracts.cleanup", "extracts.js", 1);

		//	Remove pop-frame indicator hooks.
		Extracts.rootDocument.querySelectorAll(".has-indicator-hook").forEach(link => {
			let indicatorHook = link.querySelector(".indicator-hook");

			if (link.classList.contains("has-recently-modified-icon")) {
				/*	Remove text node containing U+2060 WORD JOINER between the
					two hooks.
				 */
				if (indicatorHook.previousSibling.textContent == "\u{2060}")
					indicatorHook.previousSibling.remove();	
			} else {
				/*	Remove U+2060 WORD JOINER from first text content of link.
				 */
				let linkFirstTextNode = indicatorHook.nextSibling.firstTextNode;
				if (linkFirstTextNode.textContent.startsWith("\u{2060}"))
					linkFirstTextNode.textContent = linkFirstTextNode.textContent.slice(1);
			}

			indicatorHook.remove();

			link.classList.remove("has-indicator-hook");
		});

        //  Unbind event listeners and restore targets.
        Extracts.rootDocument.querySelectorAll(Extracts.config.contentContainersSelector).forEach(container => {
            Extracts.removeTargetsWithin(container);
        });

        //  Remove content inject event handler.
    	GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", Extracts.processTargetsOnContentInject);

		//	Remove phantom popin cleaning handler.
		if (Extracts.popFrameProvider == Popins)
			GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", Extracts.cleanPopinsFromInjectedContent);

		//	Remove pop-frames & containers.
		Extracts.popFrameProvider.cleanup();

        //  Fire cleanup-complete event.
        GW.notificationCenter.fireEvent("Extracts.cleanupDidComplete");
    },

    //  Called by: Extracts.processTargetsInContainer
    //  Called by: extracts-options.js
    addTargetsWithin: (container) => {
        GWLog("Extracts.addTargetsWithin", "extracts.js", 2);

		container.querySelectorAll(Extracts.config.targetElementsSelector).forEach(target => {
			if (   target.matches(Extracts.config.excludedElementsSelector)
				|| target.closest(Extracts.config.excludedContainerElementsSelector) != null)
				return;

			if (Extracts.testTarget(target) == false)
				return;

			if (Extracts.popFrameProvider == Popups)
				Extracts.preparePopupTarget(target);
			else // if (Extracts.popFrameProvider == Popins)
				Extracts.preparePopinTarget(target);

			let popFramePrepareFunction = (Extracts.popFrameProvider == Popups
										   ? Extracts.preparePopup
										   : Extracts.preparePopin);
			Extracts.popFrameProvider.addTarget(target, popFramePrepareFunction);
		});

		/*	Add pop-frame indicator hooks, if need be.
			(See links.css for how these are used.)
		 */
		container.querySelectorAll(".has-content").forEach(link => {
			if (link.closest(Extracts.config.hooklessLinksContainersSelector) != null)
				return;

			if (link.querySelector(".indicator-hook") != null)
				return;

			/*	Inject indicator hook span.
				(If the link already has a recently-modified icon hook, we must,
				 firstly, inject the indicator hook after the recently-modified
				 icon hook, and secondly, inject a text node containing a 
				 U+2060 WORD JOINER between the two hooks. This ensures that the
				 two link styling elements are arranged properly, and do not 
				 span a line break.)
			 */
			let recentlyModifiedIconHook = link.querySelector(".recently-modified-icon-hook");
			link.insertBefore(newElement("SPAN", { class: "indicator-hook" }), 
							  recentlyModifiedIconHook?.nextSibling ?? link.firstChild);
			if (recentlyModifiedIconHook)
				link.insertBefore(document.createTextNode("\u{2060}"), recentlyModifiedIconHook.nextSibling);

			/*	Inject U+2060 WORD JOINER at start of first text node of the
				link. (It _must_ be injected as a Unicode character into the
				existing text node; injecting it within the .indicator-hook
				span, or as an HTML escape code into the text node, or in
				any other fashion, creates a separate text node, which
				causes all sorts of problems - text shadow artifacts, etc.)
			 */
			let linkFirstTextNode = link.firstTextNode;
			if (   linkFirstTextNode
				&& linkFirstTextNode.textContent.startsWith("\u{2060}") == false)
				linkFirstTextNode.textContent = "\u{2060}" + linkFirstTextNode.textContent;

			link.classList.add("has-indicator-hook");
		});

		Extracts.setUpAnnotationLoadEventsWithin(container);
		Extracts.setUpContentLoadEventsWithin(container);
    },

    //  Called by: extracts-load.js
    //  Called by: extracts-options.js
    setup: () => {
        GWLog("Extracts.setup", "extracts.js", 1);

		//  Set pop-frame type (mode) - popups or popins.
		let mobileMode = (   localStorage.getItem("extracts-force-popins") == "true"
						  || GW.isMobile()
						  || matchMedia("(max-width: 1279px) and (max-height: 959px)").matches);
		Extracts.popFrameProviderName = mobileMode ? "Popins" : "Popups";
		GWLog(`${(mobileMode ? "Mobile" : "Non-mobile")} client detected. Activating ${(mobileMode ? "popins" : "popups")}.`, "extracts.js", 1);

		//  Prevent null references.
		Popups = window["Popups"] || { };
		Popins = window["Popins"] || { };

		//	If provider not loaded yet, defer setup until it is.
		if (window[Extracts.popFrameProviderName] == null) {
			GW.notificationCenter.addHandlerForEvent(Extracts.popFrameProviderName + ".didLoad", (info) => {
				Extracts.setup();
			}, { once: true });

			return;
		}

        //  Set service provider object.
        Extracts.popFrameProvider = window[Extracts.popFrameProviderName];

		//	Inject mode selectors, if need be.
		if (Extracts.modeSelector == null) {
			//	Inject primary (page toolbar widget) mode selector.
			Extracts.injectModeSelector();

			/*	Inject inline mode selectors in already-loaded content, and add
				rewrite processor to inject any inline selectors in subsequently
				loaded content.
			 */
			processMainContentAndAddRewriteProcessor("addInlineExtractsModeSelectorsInContainer", (container) => {
				container.querySelectorAll(".extracts-mode-selector-inline").forEach(Extracts.injectModeSelector);
				container.querySelectorAll(".extracts-mode-selector").forEach(Extracts.activateModeSelector);
			});
		}

		//	Do not proceed if disabled.
        if (Extracts.popFrameProvider == Popups) {
            GWLog("Setting up for popups.", "extracts.js", 1);

            if (Extracts.popupsEnabled() == false)
                return;

            GWLog("Activating popups.", "extracts.js", 1);
        } else {
            GWLog("Setting up for popins.", "extracts.js", 1);

			if (Extracts.popinsEnabled() == false)
				return;

            GWLog("Activating popins.", "extracts.js", 1);
        }

		//	Run provider setup.
		Extracts.popFrameProvider.setup();

        /*  Add handler to set up targets in loaded content (including
            newly-spawned pop-frames; this allows for recursion), and to
            add hover/click event listeners to annotated targets, to load
            annotations (fragments).
         */
        addContentInjectHandler(Extracts.processTargetsOnContentInject = (eventInfo) => {
            GWLog("Extracts.processTargetsOnContentInject", "extracts.js", 2);

            Extracts.processTargetsInContainer(eventInfo.container);
        }, "eventListeners");

		//	Add handler to prevent “phantom” popins.
		if (Extracts.popFrameProvider == Popins) {
			addContentInjectHandler((eventInfo) => {
				//	Clean any existing popins.
				Popins.cleanPopinsFromContainer(eventInfo.container);
			}, "rewrite");
		}

        //  Fire setup-complete event.
        GW.notificationCenter.fireEvent("Extracts.setupDidComplete");
    },

    //  Called by: Extracts.setup
    processTargetsInContainer: (container) => {
        GWLog("Extracts.processTargetsInContainer", "extracts.js", 2);

		if (   container instanceof DocumentFragment
			|| (   container instanceof Element
			    && container.closest(Extracts.config.contentContainersSelector))) {
			Extracts.addTargetsWithin(container);
		} else {
            container.querySelectorAll(Extracts.config.contentContainersSelector).forEach(contentContainer => {
                Extracts.addTargetsWithin(contentContainer);
            });
        }
    },

    /***********/
    /*  Targets.
     */

	//  See comment at Extracts.isLocalPageLink for info on this function.
	//  Called by: Extracts.addTargetsWithin
	testTarget: (target) => {
		let targetTypeInfo = Extracts.targetTypeInfo(target);
		if (targetTypeInfo) {
			let specialTestFunction = Extracts[`testTarget_${targetTypeInfo.typeName}`]
			if (   specialTestFunction
				&& specialTestFunction(target) == false)
				return false;

			//  Do not allow pop-frames to spawn themselves.
			let containingPopFrame = Extracts.popFrameProvider.containingPopFrame(target);
			if (   containingPopFrame
				&& Extracts.targetsMatch(containingPopFrame.spawningTarget, target))
				return false;

			//	Don’t spawn duplicate popins.
			if (Extracts.popFrameProvider == Popins) {
				let popinStack = Popins.allSpawnedPopins();
				if (popinStack.findIndex(popin => Extracts.targetsMatch(popin.spawningTarget, target)) !== -1)
					return false;
			}

			//  Add specified classes to the target.
			if (targetTypeInfo.targetClasses) {
				if (typeof targetTypeInfo.targetClasses == "string")
					target.classList.add(...(targetTypeInfo.targetClasses.split(" ")));
				else if (typeof targetTypeInfo.targetClasses == "function")
					target.classList.add(...(targetTypeInfo.targetClasses(target).split(" ")));
			}

			return true;
		}

		return false;
	},

	/*  This array defines the types of ‘targets’ (ie. annotated links,
		links pointing to available content such as images or code files,
		citations, etc.) that Extracts supports.
		The fields in each entry are:
			1. Type name
			2. Type predicate function (of the Extracts object) for identifying
			   targets of the type; returns true iff target is of that type
			3. Class(es) to be added to targets of the type (these are added
			   during initial processing) (may be a function on the target)
			4. Fill function (of the Extracts object); called to fill a
			   pop-frame for a target of that type with content
			5. Class(es) to be added to a pop-frame for targets of that type
			   (may be a function on the pop-frame)
	 */
	targetTypeDefinitions: [ ],

    /*  Returns full type info for the given target (in other words, the data
        from the appropriate row of the targetTypeDefinitions array), or null
        if the target is not matched by the predicate function of any known type.
     */
    //  Called by: many functions, all in extracts.js
    targetTypeInfo: (target) => {
        let info = { };
        for (definition of Extracts.targetTypeDefinitions) {
            [   info.typeName,
                info.predicateFunctionName,
                info.targetClasses,
                info.popFrameFillFunctionName,
                info.popFrameClasses
            ] = definition;
            if (Extracts[info.predicateFunctionName](target))
                return info;
        }

        return null;
    },

    //  Called by: Extracts.targetsMatch
    targetIdentifier: (target) => {
    	return Extracts.isAnnotatedLink(target)
    		   ? Annotations.targetIdentifier(target)
    		   : (target.hostname == location.hostname
                  ? target.pathname + target.hash
                  : (target instanceof HTMLAnchorElement
			  		 ? target.getAttribute("href")
			  		 : target.href));
    },

    /*  Returns true if the two targets will spawn identical popups
        (that is, if they are of the same type, and have the same identifiers).
     */
    //  Called by: Extracts.targets.testTarget
    //  Called by: Extracts.spawnedPopupMatchingTarget
    targetsMatch: (targetA, targetB) => {
        return    Extracts.targetIdentifier(targetA) == Extracts.targetIdentifier(targetB)
               && Extracts.targetTypeInfo(targetA).typeName == Extracts.targetTypeInfo(targetB).typeName;
    },

    /*  This function’s purpose is to allow for the transclusion of entire pages
        on the same website (displayed to the user in popups, or injected in
        block flow as popins), and the (almost-)seamless handling of local links
        in such transcluded content in the same way that they’re handled in the
        root document (ie. the actual page loaded in the browser window). This
        permits us to have truly recursive popups with unlimited recursion depth
        and no loss of functionality.

        For any given target element, targetDocument() asks: to what local
        document does the link refer?

        This may be either the root document, or an entire other page that was
        transcluded wholesale and embedded as a pop-frame (of class
        ‘full-page’).
     */
    //  Called by: Extracts.localPageForTarget
    //  Called by: Extracts.titleForPopFrame_LOCAL_PAGE
    //  Called by: extracts-content.js
    targetDocument: (target) => {
        if (target.hostname != location.hostname)
            return null;

        if (target.pathname == location.pathname)
            return Extracts.rootDocument;

        if (Extracts.popFrameProvider == Popups) {
            let popupForTargetDocument = Popups.allSpawnedPopups().find(popup => (   popup.classList.contains("full-page")
                                                                                  && popup.spawningTarget.pathname == target.pathname));
            return popupForTargetDocument ? popupForTargetDocument.document : null;
        } else if (Extracts.popFrameProvider == Popins) {
            let popinForTargetDocument = Popins.allSpawnedPopins().find(popin => (   popin.classList.contains("full-page")
                                                                                  && popin.spawningTarget.pathname == target.pathname)
                                                                                  && Extracts.popFrameHasLoaded(popin));
            return popinForTargetDocument ? popinForTargetDocument.document : null;
        }
    },

	//	Called by: extracts-content.js
	addPopFrameClassesToLink: (link, ...classes) => {
		link.dataset.popFrameClasses = [ ...(link.dataset.popFrameClasses?.split(" ") ?? [ ]), ...classes ].join(" ");
	},

    /***************************/
    /*  Pop-frames (in general).
     */

	popFrameTypeSuffix: () => {
		return (Extracts.popFrameProvider == Popups
				? "up"
				: "in");
	},

    /*  This function fills a pop-frame for a given target with content. It
        returns true if the pop-frame successfully filled, false otherwise.
     */
    //  Called by: Extracts.preparePopFrame
    //  Called by: Extracts.refreshPopFrameAfterLocalPageLoads
    //  Called by: extracts-annotations.js
    fillPopFrame: (popFrame) => {
        GWLog("Extracts.fillPopFrame", "extracts.js", 2);

        let didFill = false;
        let target = popFrame.spawningTarget;
        let targetTypeInfo = Extracts.targetTypeInfo(target);
        if (   targetTypeInfo
        	&& targetTypeInfo.popFrameFillFunctionName) {
            didFill = Extracts.popFrameProvider.setPopFrameContent(popFrame, Extracts[targetTypeInfo.popFrameFillFunctionName](target));
            if (targetTypeInfo.popFrameClasses) {
				if (typeof targetTypeInfo.popFrameClasses == "string")
					Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(targetTypeInfo.popFrameClasses.split(" ")));
				else if (typeof targetTypeInfo.popFrameClasses == "function")
					Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(targetTypeInfo.popFrameClasses(popFrame).split(" ")));
			}
        }

        if (didFill) {
            return true;
        } else {
            GWLog(`Unable to fill pop-frame (${Extracts.targetIdentifier(target)} [${(targetTypeInfo ? targetTypeInfo.typeName : "UNDEFINED")}])!`, "extracts.js", 1);
            return false;
        }
    },

    //  Called by: Extracts.targetDocument
    //  Called by: Extracts.preparePopup
    //  Called by: Extracts.preparePopin
    //  Called by: extracts-annotations.js
    popFrameHasLoaded: (popFrame) => {
        return ((   Extracts.popFrameProvider.popFrameStateLoading(popFrame) 
        		 || Extracts.popFrameProvider.popFrameStateLoadingFailed(popFrame)) == false);
    },

    //  Called by: Extracts.titleForPopFrame
    //  Called by: Extracts.titleForPopFrame_LOCAL_PAGE
    //  Called by: extracts-annotations.js
    //  Called by: extracts-content.js
    standardPopFrameTitleElementForTarget: (target, titleHTML) => {
        if (typeof titleHTML == "undefined") {
            let titleText = (target.hostname == location.hostname)
            				? target.pathname + target.hash
            				: target.href;
            titleHTML = `<code>${titleText}</code>`;
    	}

		return Transclude.fillTemplateNamed("pop-frame-title-standard", {
			popFrameTitleLinkHref:  target.href,
			popFrameTitle:          titleHTML
		});
    },

    /*  Returns the contents of the title element for a pop-frame.
     */
    //  Called by: Extracts.preparePopup
    //  Called by: Extracts.preparePopin
    //  Called by: Extracts.rewritePopinContent
    titleForPopFrame: (popFrame, titleHTML) => {
        let target = popFrame.spawningTarget;

        //  Special handling for certain popup types.
        let targetTypeName = Extracts.targetTypeInfo(target).typeName;
        let suffix = Extracts.popFrameTypeSuffix();
        let specialTitleFunction = (   Extracts[`titleForPop${suffix}_${targetTypeName}`]
        							?? Extracts[`titleForPopFrame_${targetTypeName}`]);
        if (specialTitleFunction)
            return specialTitleFunction(popFrame, titleHTML);
        else
            return Extracts.standardPopFrameTitleElementForTarget(target, titleHTML);
    },

	//	Called by: Extracts.rewritePopinContent
	//	Called by: Extracts.rewritePopFrameContent_LOCAL_PAGE
	updatePopFrameTitle: (popFrame, titleHTML) => {
        GWLog("Extracts.updatePopFrameTitle", "extracts.js", 2);

		if (popFrame.titleBar) {
			popFrame.titleBar.querySelector(".popframe-title").replaceChildren(Extracts.titleForPopFrame(popFrame, titleHTML));
		} else if (popFrame.titleBarContents) {
			popFrame.titleBarContents.find(x => x.classList.contains("popframe-title")).replaceChildren(Extracts.titleForPopFrame(popFrame, titleHTML));
		}
	},

	//	Called by: Extracts.setLoadingSpinner
	postRefreshUpdatePopFrame: (popFrame, success) => {
        GWLog("Extracts.postRefreshUpdatePopFrame", "extracts.js", 2);

		if (success)
			Extracts.popFrameProvider.clearPopFrameState(popFrame);
		else
			Extracts.popFrameProvider.setPopFrameStateLoadingFailed(popFrame);

		if (Extracts.popFrameProvider.isSpawned(popFrame)) {
			//  Update pop-frame position.
			if (Extracts.popFrameProvider == Popups)
				Popups.positionPopup(popFrame, { reset: true });
			else if (Extracts.popFrameProvider == Popins)
				Popins.scrollPopinIntoView(popFrame);
		}
	},

    //  Called by: Extracts.rewritePopFrameContent
    setLoadingSpinner: (popFrame, useObject = false) => {
        Extracts.popFrameProvider.setPopFrameStateLoading(popFrame);

		if (useObject == false)
			return;
        let objectOfSomeSort = popFrame.document.querySelector("iframe, img, video, audio");
		if (objectOfSomeSort == null)
			return;

		let url = [ "IMG", "IFRAME" ].includes(objectOfSomeSort.tagName)
				  ? URLFromString(objectOfSomeSort.src)
				  : URLFromString(objectOfSomeSort.querySelector("source").src);

		/*	The HTTP HEAD trick does not work with foreign-site pop-frames,
			due to CORS. So, we use load/error events (which are less reliable).
		 */
		if (url.hostname != location.hostname) {
			objectOfSomeSort.onload = (event) => {
				Extracts.postRefreshUpdatePopFrame(popFrame, true);
			};
			//	Note that iframes do not fire ‘error’ on HTTP error.
			objectOfSomeSort.onerror = (event) => {
				Extracts.postRefreshUpdatePopFrame(popFrame, false);
			};
		} else {
			doAjax({
				location: url.href,
				method: "HEAD",
				onSuccess: (event) => {
					Extracts.postRefreshUpdatePopFrame(popFrame, true);
				},
				onFailure: (event) => {
					Extracts.postRefreshUpdatePopFrame(popFrame, false);
				}
			});
		}
    },

	//	Called by: Extracts.rewritePopFrameContent_LOCAL_PAGE
	//	Called by: Extracts.rewritePopupContent_CITATION_BACK_LINK
    scrollToTargetedElementInPopFrame: (popFrame) => {
        GWLog("Extracts.scrollToTargetedElementInPopFrame", "extracts.js", 3);

        let target = popFrame.spawningTarget;

        if (isAnchorLink(target)) {
            requestAnimationFrame(() => {
            	let element = null;
                if (   popFrame
                    && (element = targetElementInDocument(target, popFrame.document))) {
					//	Scroll to element immediately...
                    revealElement(element);

					//	... and also after the first layout pass completes.
					GW.notificationCenter.addHandlerForEvent("Layout.layoutProcessorDidComplete", (layoutEventInfo) => {
						revealElement(element);
					}, {
						condition: (layoutEventInfo) => (   layoutEventInfo.container == popFrame.body
														 && layoutEventInfo.processorName == "applyBlockSpacingInContainer"),
						once: true
					});
                }
            });
        }
    },

    //  Make anchorlinks scroll pop-frame instead of opening normally.
	constrainLinkClickBehaviorInPopFrame: (popFrame, extraCondition = (link => true)) => {
        let target = popFrame.spawningTarget;

        popFrame.document.querySelectorAll("a").forEach(link => {
            if (   link.hostname == target.hostname
                && link.pathname == target.pathname
                && link.hash > ""
                && extraCondition(link)) {
                link.onclick = (event) => { return (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey); };
                link.addActivateEvent((event) => {
					if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
						return;

                    let hashTarget = targetElementInDocument(link, popFrame.document);
                    if (hashTarget)
                        revealElement(hashTarget);
                });
            }
        });
	},

    //  Called by: Extracts.preparePopup
    //  Called by: Extracts.preparePopin
    preparePopFrame: (popFrame) => {
        GWLog("Extracts.preparePopFrame", "extracts.js", 2);

        //  Attempt to fill the popup.
        if (Extracts.fillPopFrame(popFrame) == false)
            return null;

		//  Turn loading spinner on.
		Extracts.setLoadingSpinner(popFrame);

        //  Import the class(es) of the target.
        Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(popFrame.spawningTarget.classList));
        //  We then remove some of the imported classes.
        Extracts.popFrameProvider.removeClassesFromPopFrame(popFrame, 
        	"uri", "has-annotation", "has-annotation-partial", "has-content", 
        	"link-self", "link-annotated", "link-page",
        	"has-icon", "icon-not", "has-indicator-hook", "decorate-not",
        	"spawns-popup", "spawns-popin",
        	"widget-button");

		//	Import classes from include-link.
		if (popFrame.body.firstElementChild.dataset.popFrameClasses > "")
			Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(popFrame.body.firstElementChild.dataset.popFrameClasses.split(" ")));

		//	Determine pop-frame type.
        let suffix = Extracts.popFrameTypeSuffix();

        //  Add pop-frame title bar contents.
		popFrame.titleBarContents = Extracts[`pop${suffix}TitleBarContents`](popFrame);

        //  Add ‘markdownBody’ class.
        popFrame.body.classList.add("markdownBody");

		//	Set base location for the pop-frame document.
		popFrame.document.baseLocation = URLFromString(popFrame.spawningTarget.href);

        //  Special handling for certain pop-frame types.
        let targetTypeName = Extracts.targetTypeInfo(popFrame.spawningTarget).typeName;
        let specialPrepareFunction = (   Extracts[`preparePop${suffix}_${targetTypeName}`] 
        							  ?? Extracts[`preparePopFrame_${targetTypeName}`]);
        if (specialPrepareFunction)
            if ((popFrame = specialPrepareFunction(popFrame)) == null)
                return null;

		//	Inject styles.
		let inlinedStyleIDs = [
			"inlined-styles-colors",
			"inlined-styles-colors-dark",
			"mathjax-styles"
		];
		Array.from(document.styleSheets).filter(styleSheet =>
			(   styleSheet.ownerNode.tagName == "LINK"
			 || inlinedStyleIDs.includes(styleSheet.ownerNode.id))
		).forEach(styleSheet => {
			let styleBlock = elementFromHTML("<style>"
				+ Array.from(styleSheet.cssRules).map(rule => rule.cssText).join("\n")
				+ "</style>");
			[ "id", "media" ].forEach(attribute => {
				if (styleSheet.ownerNode.hasAttribute(attribute))
					styleBlock.setAttribute(attribute, styleSheet.ownerNode.getAttribute(attribute));
			});
			popFrame.document.insertBefore(styleBlock, popFrame.body);
		});
		//	Add handler to update styles when mode switches.
		GW.notificationCenter.addHandlerForEvent("DarkMode.didSetMode", popFrame.darkModeDidSetModeHandler = (info) => {
			let currentMode = DarkMode.currentMode();
			popFrame.document.querySelectorAll(DarkMode.switchedElementsSelector).forEach(element => {
				element.media = DarkMode.mediaAttributeValues[currentMode];
			});
		});
		//	Add handler to remove the above handler when pop-frame despawns.
		GW.notificationCenter.addHandlerForEvent(`Pop${suffix}s.pop${suffix}WillDespawn`, (info) => {
			GW.notificationCenter.removeHandlerForEvent("DarkMode.didSetMode", popFrame.darkModeDidSetModeHandler);
		}, {
			once: true,
			condition: (info) => (info[`pop${suffix}`] == popFrame)
		});

		//	Activate dynamic layout for the pop-frame.
		startDynamicLayoutInContainer(popFrame.body);

		//	Register copy processors in pop-frame.
		registerCopyProcessorsForDocument(popFrame.document);

		//	Add handler to update pop-frame position when content changes.
		GW.notificationCenter.addHandlerForEvent("Rewrite.contentDidChange", popFrame.contentDidChangeHandler = (info) => {
			if (   Transclude.isIncludeLink(popFrame.body.firstElementChild)
				&& popFrame.body.firstElementChild.classList.contains("include-loading-failed")) {
				Extracts.postRefreshUpdatePopFrame(popFrame, false);
			} else {
				Extracts.postRefreshUpdatePopFrame(popFrame, true);
			}
		}, {
			condition: (info) => (info.document == popFrame.document)
		});
		//	Add handler to remove the above handler when pop-frame despawns.
		GW.notificationCenter.addHandlerForEvent(`Pop${suffix}s.pop${suffix}WillDespawn`, (info) => {
			GW.notificationCenter.removeHandlerForEvent("Rewrite.contentDidChange", popFrame.contentDidChangeHandler);
		}, {
			once: true,
			condition: (info) => (info[`pop${suffix}`] == popFrame)
		});

		//	Update pop-frame when content is injected.
		GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (info) => {
			//	Refresh (turning loading spinner off).
			Extracts.postRefreshUpdatePopFrame(popFrame, true);

			//	Type-specific updates.
			(   Extracts[`updatePop${suffix}_${targetTypeName}`] 
			 ?? Extracts[`updatePopFrame_${targetTypeName}`]
			 )?.(popFrame);
		}, {
			phase: "<",
			condition: (info) => (   info.source == "transclude"
								  && info.document == popFrame.document),
			once: true
		});

		//	Rewrite pop-frame content when it’s injected.
		GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (info) => {
			//  Type-specific rewrites.
			(   Extracts[`rewritePop${suffix}Content_${targetTypeName}`] 
			 ?? Extracts[`rewritePopFrameContent_${targetTypeName}`]
			 )?.(popFrame, info.container);

			//	Additional rewrites.
			Extracts.additionalRewrites.forEach(rewriteFunction => {
				rewriteFunction(popFrame);
			});

			//  Turn loading spinner back on, if need be.
			if (popFrame.classList.contains("object"))
				Extracts.setLoadingSpinner(popFrame, true);
		}, {
			phase: "rewrite",
			condition: (info) => (   info.source == "transclude"
								  && info.document == popFrame.document),
			once: true
		});

		//	Trigger transclude.
		Transclude.triggerTranscludesInContainer(popFrame.body, {
			source: "Extracts.preparePopFrame",
			container: popFrame.body,
			document: popFrame.document,
			context: "popFrame"
		});

        return popFrame;
    },

	//	Functions added to this array should take one argument (the pop-frame).
	additionalRewrites: [ ],

    /**********/
    /*  Popins.
     */

	popinsDisabledLocalStorageItemKey: "extract-popins-disabled",

    //  Called by: Extracts.setup
    popinsEnabled: () => {
        return (localStorage.getItem(Extracts.popinsDisabledLocalStorageItemKey) != "true");
    },

    //  Called by: Extracts.addTargetsWithin
	preparePopinTarget: (target) => {
		target.adjustPopinWidth = (popin) => {
			let leftMargin, rightMargin;
			let popinRect = popin.getBoundingClientRect();
			if (GW.mediaQueries.mobileWidth.matches) {
				//	Make popin take up entire content column width.
				let bodyRect = document.main.getBoundingClientRect();
				leftMargin = (bodyRect.left - popinRect.left);
				rightMargin = (popinRect.right - bodyRect.right);
			} else {
				let containerSelector = [
					".abstract blockquote",
					".markdownBody"
				].join(", ");
				let containerRect = (popin.closest(containerSelector) ?? document.main).getBoundingClientRect();
				leftMargin = (containerRect.left - popinRect.left);
				rightMargin = (popinRect.right - containerRect.right);
			}
			popin.style.marginLeft = `${leftMargin}px`;
			popin.style.marginRight = `${rightMargin}px`;
			popin.style.width = `calc(${popinRect.width}px + ${(-1 * (leftMargin + rightMargin))}px)`;
		};
	},

	//	Called by: Extracts.preparePopFrame (as Extracts[`pop${suffix}TitleBarContents`])
	popinTitleBarContents: (popin) => {
        let titleBarContents = [ ];

		/*	Show “disable popovers” button only for a top-level popover, not for
			nested popovers.
		 */
        if (Popins.containingPopFrame(popin.spawningTarget) == null)
        	titleBarContents.push(Extracts.disableExtractPopFramesPopFrameTitleBarButton());

        let popinTitle = Extracts.titleForPopFrame(popin) ?? { };
        titleBarContents.push(newElement("SPAN", { "class": "popframe-title" }, { "innerHTML": popinTitle.innerHTML }),
							  Popins.titleBarComponents.closeButton());

		return titleBarContents;
	},

    /*  Called by popins.js just before injecting the popin. This is our chance
        to fill the popin with content, and rewrite that content in whatever
        ways necessary. After this function exits, the popin will appear on the
        screen.
     */
    //  Called by: popins.js
    preparePopin: (popin) => {
        GWLog("Extracts.preparePopin", "extracts.js", 2);

		/*	Set popin title-bar link (and title link in popin content, if any)
			to spawning link icon hover color, if any.
		 */
		let target = popin.spawningTarget;
		if (target.dataset.linkIconColor > "") {
			popin.style.setProperty("--popframe-title-link-color", target.dataset.linkIconColor);
			popin.body.style.setProperty("--popframe-title-link-color", target.dataset.linkIconColor);
		}

        /*  Call generic pop-frame prepare function (which will attempt to fill
            the popin).
         */
        return Extracts.preparePopFrame(popin);
    },

    /**********/
    /*  Popups.
     */

	popupsDisabledLocalStorageItemKey: "extract-popups-disabled",

    //  Called by: Extracts.setup
    //  Called by: extracts-options.js
    popupsEnabled: () => {
        return (localStorage.getItem(Extracts.popupsDisabledLocalStorageItemKey) != "true");
    },

    //  Called by: Extracts.addTargetsWithin
    preparePopupTarget: (target) => {
        //  Remove the title attribute (saving it first);
        if (target.title) {
            target.dataset.attributeTitle = target.title;
            target.removeAttribute("title");
        }

        //  For special positioning by Popups.js.
        target.preferPopupSidePositioning = () => {
            return (   target.closest("li") != null
                    && target.closest(".columns") == null);
        };
    },

	//	Called by: Extracts.preparePopFrame (as Extracts[`pop${suffix}TitleBarContents`])
	popupTitleBarContents: (popup) => {
        let popupTitle = Extracts.titleForPopFrame(popup) ?? { };
		return [
			Popups.titleBarComponents.closeButton(),
			Popups.titleBarComponents.zoomButton().enableSubmenu(),
			Popups.titleBarComponents.minimizeButton(),
			Popups.titleBarComponents.pinButton(),
			newElement("SPAN", { "class": "popframe-title" }, { "innerHTML": popupTitle.innerHTML }),
			Extracts.disableExtractPopFramesPopFrameTitleBarButton()
		];
	},

    //  Called by: Extracts.preparePopup
    spawnedPopupMatchingTarget: (target) => {
        return Popups.allSpawnedPopups().find(popup =>
                   Extracts.targetsMatch(target, popup.spawningTarget)
                && Popups.popupIsPinned(popup) == false);
    },

    /*  Called by popups.js just before spawning (injecting and positioning) the
        popup. This is our chance to fill the popup with content, and rewrite
        that content in whatever ways necessary. After this function exits, the
        popup will appear on the screen.
     */
    //  (See also Extracts.addTargetsWithin)
    preparePopup: (popup) => {
        GWLog("Extracts.preparePopup", "extracts.js", 2);

        let target = popup.spawningTarget;

        /*  If a popup already exists that matches the target, do not spawn a
            new popup; just use the existing popup.
         */
        let existingPopup = Extracts.spawnedPopupMatchingTarget(target);
        if (existingPopup)
            return existingPopup;

        /*  Call generic pop-frame prepare function (which will attempt to fill
            the popup).
         */
        return Extracts.preparePopFrame(popup);
    }
};

/*****************************************************************************/
/*	Browser native image lazy loading does not seem to work in pop-frames (due
	to the shadow root or the nested scroll container or some combination
	thereof), so we have to implement it ourselves.
 */
Extracts.additionalRewrites.push(Extracts.lazyLoadImages = (popFrame) => {
    GWLog("Extracts.lazyLoadImages", "extracts.js", 2);

	popFrame.document.querySelectorAll("img[loading='lazy']").forEach(image => {
		lazyLoadObserver(() => {
			image.loading = "eager";
			image.decoding = "sync";
		}, image, {
			root: scrollContainerOf(image),
			rootMargin: window.innerHeight + "px"
		});
	});
});
/*=-------------=*/
/*= ANNOTATIONS =*/
/*=-------------=*/

Extracts.targetTypeDefinitions.push([
    "ANNOTATION",               // Type name
    "isAnnotatedLink",          // Type predicate function
    "has-annotation",           // Target classes to add
    "annotationForTarget",      // Pop-frame fill function
    "annotation"                // Pop-frame classes
]);

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    //  Called by: extracts.js
    //  Called by: extracts-content.js
    isAnnotatedLink: (target) => {
        return Annotations.isAnnotatedLinkFull(target);
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `ANNOTATION` targets. It
        returns false if the target is to be excluded, true otherwise. Excluded
        targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_ANNOTATION: (target) => {
        return (!(   Extracts.popFrameProvider == Popins
                  && (   Extracts.isTOCLink(target)
                      || Extracts.isSidebarLink(target))));
    },

    /*  An annotation for a link.
        */
    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    annotationForTarget: (target) => {
        GWLog("Extracts.annotationForTarget", "extracts-annotations.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "link-annotated include-annotation include-strict include-spinner-not",
			"data-include-template": "$popFrameTemplate"
		}));
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_ANNOTATION: (popFrame) => {
        GWLog("Extracts.titleForPopFrame_ANNOTATION", "extracts-annotations.js", 2);

		let target = popFrame.spawningTarget;
		let referenceData = Annotations.referenceDataForLink(target);
		return (referenceData
				? Transclude.fillTemplateNamed("pop-frame-title-standard", referenceData)
				: Extracts.standardPopFrameTitleElementForTarget(target));
    },

    //  Called by: extracts.js (as `preparePopFrame_${targetTypeName}`)
	preparePopFrame_ANNOTATION: (popFrame) => {
		//	Base location is URL of the annotation itself.
		popFrame.document.baseLocation = Annotations.sourceURLForLink(popFrame.spawningTarget);

		return popFrame;
	},

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_ANNOTATION: (popup) => {
        /*  Do not spawn annotation popup if the annotation is already visible
            on screen. (This may occur if the target is in a popup that was
            spawned from a backlinks popup for this same annotation as viewed on
            a tag index page, for example.)
         */
        let escapedLinkURL = CSS.escape(decodeURIComponent(popup.spawningTarget.href));
        let targetAnalogueInLinkBibliography = document.querySelector(`a[id^='link-bibliography'][href='${escapedLinkURL}']`);
        if (targetAnalogueInLinkBibliography) {
            let containingSection = targetAnalogueInLinkBibliography.closest("section");
            if (   containingSection
                && containingSection.querySelector("blockquote")
                && Popups.isVisible(containingSection)) {
                return null;
            }
        }
        /*	Likewise do not spawn annotation popup if the current page is the 
        	/blog/ page for that same annotation.
         */
        if (   location.pathname.startsWith("/blog/")
        	&& location.pathname.slice("/blog/".length) == popup.spawningTarget.id.slice("gwern-".length))
        	return null;

		return Extracts.preparePopFrame_ANNOTATION(popup);
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_ANNOTATION: (popFrame) => {
        GWLog("Extracts.updatePopFrame_ANNOTATION", "extracts-annotations.js", 2);

        //  Update pop-frame title.
        Extracts.updatePopFrameTitle(popFrame);
	},

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_ANNOTATION: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_ANNOTATION", "extracts-annotations.js", 2);

		/*	For annotated media, rearrange annotation content so that the media
			itself follows the abstract (but precedes the aux-links), and the
			caption is not unnecessarily duplicated.
		 */
		if ([ "remoteImage", 
			  "remoteVideo",
			  "localImage", 
			  "localVideo", 
			  "localAudio" 
			  ].findIndex(x => Content.contentTypes[x].matches(popFrame.spawningTarget)) !== -1) {
			let annotationAbstract = contentContainer.querySelector(".annotation-abstract");
			let fileIncludes = contentContainer.querySelector(".file-includes");
			let includeLink = fileIncludes.querySelector("a");
			includeLink.classList.add("include-caption-not");
			annotationAbstract.insertBefore(includeLink, annotationAbstract.querySelector(".aux-links-append"));
			fileIncludes.remove();
		}
    }
};

/*=-----------------------=*/
/*= ANNOTATIONS (PARTIAL) =*/
/*=-----------------------=*/

Extracts.targetTypeDefinitions.push([
    "ANNOTATION_PARTIAL",            // Type name
    "isPartialAnnotationLink",       // Type predicate function
    "has-annotation-partial",        // Target classes to add
    "partialAnnotationForTarget",    // Pop-frame fill function
    "annotation annotation-partial"  // Pop-frame classes
]);

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    //  Called by: extracts.js
    //  Called by: extracts-content.js
    isPartialAnnotationLink: (target) => {
        return Annotations.isAnnotatedLinkPartial(target);
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `ANNOTATION` targets. It
        returns false if the target is to be excluded, true otherwise. Excluded
        targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_ANNOTATION_PARTIAL: (target) => {
    	return Extracts.testTarget_ANNOTATION(target);
    },

    /*  A partial annotation for a link.
        */
    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    partialAnnotationForTarget: (target) => {
        GWLog("Extracts.partialAnnotationForTarget", "extracts-annotations.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "link-annotated-partial include-annotation-partial include-strict include-spinner-not",
			"data-include-template": "$popFrameTemplate"
		}));
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_ANNOTATION_PARTIAL: (popFrame) => {
        GWLog("Extracts.titleForPopFrame_ANNOTATION_PARTIAL", "extracts-annotations.js", 2);

		return Extracts.titleForPopFrame_ANNOTATION(popFrame);
    },

    //  Called by: extracts.js (as `preparePopFrame_${targetTypeName}`)
	preparePopFrame_ANNOTATION_PARTIAL: (popFrame) => {
		//	Remove the base location.
		return Extracts.preparePopFrame_ANNOTATION(popFrame);
	},

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_ANNOTATION_PARTIAL: (popup) => {
    	return Extracts.preparePopup_ANNOTATION(popup);
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_ANNOTATION_PARTIAL: (popFrame) => {
        GWLog("Extracts.updatePopFrame_ANNOTATION_PARTIAL", "extracts-annotations.js", 2);

		Extracts.updatePopFrame_ANNOTATION(popFrame);
	},

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_ANNOTATION_PARTIAL: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_ANNOTATION_PARTIAL", "extracts-annotations.js", 2);

		Extracts.rewritePopFrameContent_ANNOTATION(popFrame, contentContainer);
    }
};

/************************************************************************/
/*	Inject partial-annotation metadata into a popup that is not already a
	partial annotation.
 */
Extracts.additionalRewrites.push(Extracts.injectPartialAnnotationMetadata = (popFrame) => {
    GWLog("Extracts.injectPartialAnnotationMetadata", "extracts.js", 2);

	let target = popFrame.spawningTarget;
	if (   Annotations.isAnnotatedLinkPartial(target) == false
		|| Extracts.targetTypeInfo(target).typeName == "ANNOTATION_PARTIAL")
		return;

	//	Construct container and synthesized include-link.
	let partialAnnotationAppendContainer = newElement("DIV", {
		"class": [ "partial-annotation-append-container",
				   "markdownBody",
				   "popframe-body",
				   "popframe-footer",
				   (Extracts.popFrameProvider == Popups ? "popup-body" : "popin-body")
				   ].join(" ")
	});
	partialAnnotationAppendContainer.appendChild(synthesizeIncludeLink(target.href, {
		"class": "link-annotated-partial include-annotation-partial include-strict",
		"data-include-template": "annotation-blockquote-inside"
	}));

	//	Add the whole thing to the pop-frame.
	Extracts.popFrameProvider.addPartToPopFrame(popFrame, partialAnnotationAppendContainer);
	Extracts.popFrameProvider.addClassesToPopFrame(popFrame, "has-footer");

	//	Trigger transclude of the partial annotation.
	Transclude.triggerTranscludesInContainer(partialAnnotationAppendContainer, {
		source: "Extracts.injectPartialAnnotationMetadata",
		container: partialAnnotationAppendContainer,
		document: partialAnnotationAppendContainer
	});
});

/*=----------------------=*/
/*= ANNOTATIONS: HELPERS =*/
/*=----------------------=*/

Extracts = { ...Extracts,
    annotationLoadHoverDelay: 25,

    //  Called by: extracts.js
    setUpAnnotationLoadEventsWithin: (container) => {
        GWLog("Extracts.setUpAnnotationLoadEventsWithin", "extracts-annotations.js", 2);

        //  Get all the annotated targets in the container.
        let allAnnotatedTargetsInContainer = Annotations.allAnnotatedLinksInContainer(container);

        if (Extracts.popFrameProvider == Popups) {
            //  Add hover event listeners to all the annotated targets.
            allAnnotatedTargetsInContainer.forEach(annotatedTarget => {
                annotatedTarget.removeAnnotationLoadEvents = onEventAfterDelayDo(annotatedTarget, "mouseenter", Extracts.annotationLoadHoverDelay, (event) => {
                    //  Do nothing if the annotation is already loaded.
                    if (Annotations.cachedDataExists(annotatedTarget) == false)
                        Annotations.load(annotatedTarget);
                }, {
                	cancelOnEvents: [ "mouseleave" ]
                });
            });

			if (allAnnotatedTargetsInContainer.length > 0) {
				/*  Set up handler to remove hover event listeners from all
					the annotated targets in the document.
					*/
				GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
					allAnnotatedTargetsInContainer.forEach(annotatedTarget => {
						if (annotatedTarget.removeAnnotationLoadEvents) {
							annotatedTarget.removeAnnotationLoadEvents();
							annotatedTarget.removeAnnotationLoadEvents = null;
						}
					});
				}, { once: true });
            }
        } else { // if (Extracts.popFrameProvider == Popins)
            //  Add click event listeners to all the annotated targets.
            allAnnotatedTargetsInContainer.forEach(annotatedTarget => {
                annotatedTarget.addEventListener("click", annotatedTarget.annotationLoad_click = (event) => {
                    //  Do nothing if the annotation is already loaded.
                    if (Annotations.cachedDataExists(annotatedTarget) == false)
                        Annotations.load(annotatedTarget);
                });
            });

            /*  Set up handler to remove click event listeners from all
                the annotated targets in the document.
                */
            GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
                allAnnotatedTargetsInContainer.forEach(annotatedTarget => {
                    annotatedTarget.removeEventListener("click", annotatedTarget.annotationLoad_click);
                });
            }, { once: true });
        }
    }
};
/***************************************************************************/
/*  The target-testing and pop-frame-filling functions in this section
	come in sets, which define and implement classes of pop-frames
	(whether those be popups, or popins, etc.). (These classes are things
	like “a link that has a statically generated extract provided for it”,
	“a link to a locally archived web page”, “an anchorlink to a section of
	the current page”, and so on.)

	Each set contains a testing function, which is called by
	testTarget() to determine if the target (link, etc.) is eligible for
	processing, and is also called by fillPopFrame() to find the
	appropriate filling function for a pop-frame spawned by a given
	target. The testing function takes a target element and examines its
	href or other properties, and returns true if the target is a member of
	that class of targets, false otherwise.

	NOTE: These testing (a.k.a. “type predicate”) functions SHOULD NOT be used
	directly, but only via Extracts.targetTypeInfo()!

	Each set also contains the corresponding filling function, which
	is called by fillPopFrame() (chosen on the basis of the return values
	of the testing functions, and the specified order in which they’re
	called). The filling function takes a target element and returns a
	DocumentFragment whose contents should be injected into the pop-frame
	spawned by the given target.
 */

Extracts.targetTypeDefinitions.insertBefore([
	"LOCAL_PAGE",          // Type name
	"isLocalPageLink",     // Type predicate function
	"has-content",         // Target classes to add
	"localPageForTarget",  // Pop-frame fill function
	"local-page"           // Pop-frame classes
], (def => def[0] == "ANNOTATION_PARTIAL"));

/*=-------------=*/
/*= LOCAL PAGES =*/
/*=-------------=*/

Extracts = { ...Extracts,
    /*  Local links (to sections of the current page, or other site pages).
     */
    //  Called by: Extracts.targetTypeInfo (as `predicateFunctionName`)
    isLocalPageLink: (target) => {
        return (   Content.contentTypes.localPage.matches(target)
				&& (   isAnchorLink(target)
					|| target.pathname != location.pathname));
    },

    /*  TOC links.
     */
    //  Called by: Extracts.testTarget_LOCAL_PAGE
    //  Called by: Extracts.preparePopup_LOCAL_PAGE
    isTOCLink: (target) => {
        return (target.closest("#TOC") != null);
    },

    /*  Links in the sidebar.
     */
    //  Called by: Extracts.testTarget_LOCAL_PAGE
    isSidebarLink: (target) => {
        return (target.closest("#sidebar") != null);
    },

	/*	“Full context” links in backlinks lists.
	 */
	isFullBacklinkContextLink: (target) => {
		return (   target.closest(".backlink-source") != null
				&& target.classList.contains("link-page")
				&& Annotations.isAnnotatedLink(target) == false);
	},

	/*	Annotation title-links on mobile.
	 */
	isMobileAnnotationTitleLink: (target) => {
		return (   GW.isMobile()
				&& target.matches(".data-field.title a.title-link"));
	},

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `LOCAL_PAGE` targets. It
        returns false if the target is to be excluded, true otherwise. Excluded
        targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_LOCAL_PAGE: (target) => {
        return (!(   Extracts.popFrameProvider == Popins
        		  && (   Extracts.isTOCLink(target)
        			  || Extracts.isSidebarLink(target)
        			  || Extracts.isMobileAnnotationTitleLink(target))));
    },

    //  Called by: Extracts.fillPopFrame (as `popFrameFillFunctionName`)
    //	Called by: Extracts.citationForTarget (extracts-content.js)
    //	Called by: Extracts.citationBackLinkForTarget (extracts-content.js)
    localPageForTarget: (target) => {
        GWLog("Extracts.localPageForTarget", "extracts-content.js", 2);

		/*  If the target is an anchor-link, check to see if the target location
			matches an already-displayed page (which can be the root page of the
			window).

			If the entire linked page is already displayed, and if the
			target points to an anchor in that page, display the linked
			section or element.

			Also display just the linked block if we’re spawning this
			pop-frame from a table of contents.

			Otherwise, display the entire linked page.
		 */
		let fullPage = !(   isAnchorLink(target)
        				 && (   target.closest(".TOC")
        					 || Extracts.targetDocument(target)));

		//	Synthesize include-link (with or without hash, as appropriate).
		let includeLink = synthesizeIncludeLink(target, {
			class: "include-strict include-block-context-expanded include-spinner-not"
		});

		//  Mark full-page embed pop-frames.
        if (fullPage)
			Extracts.addPopFrameClassesToLink(includeLink, "full-page");

		//	Designate “full context” pop-frames for backlinks.
		if (Extracts.isFullBacklinkContextLink(target))
			Extracts.addPopFrameClassesToLink(includeLink, "full-backlink-context");

		if (fullPage) {
			stripAnchorsFromLink(includeLink);
		} else if (   Extracts.isFullBacklinkContextLink(target)
				   && target.pathname == location.pathname) {
			/*	Since “full” context is just the base page, which we don’t want
				to pop up/in, we instead show the containing section or
				footnote.
			 */
			let targetElement = targetElementInDocument(target, Extracts.rootDocument);
			let nearestSection = targetElement.closest("section, li.footnote");
			if (nearestSection)
				includeLink.hash = "#" + nearestSection.id;
		}

		return newDocument(includeLink);
    },

    //  Called by: Extracts.titleForPopFrame (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.titleForPopFrame_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popFrame.spawningTarget;
        let referenceData = Content.referenceDataForLink(target);

		let popFrameTitleHTML;
		if (referenceData == null) {
			let popFrameTitleText = "";
			if (target.pathname != location.pathname)
				popFrameTitleText += target.pathname;
			if (popFrame.classList.contains("full-page") == false)
				popFrameTitleText += target.hash;
			popFrameTitleHTML = `<code>${popFrameTitleText}</code>`;
		} else {
			let popFrameTitleTextParts = [ ];
			if (target.pathname != location.pathname)
				popFrameTitleTextParts.push(referenceData.pageTitle);
			if (popFrame.classList.contains("full-page") == false) {
                //  Find the target element and/or containing block, if any.
                let element = targetElementInDocument(target, referenceData.content);

                //  Section title or block id.
                if (element) {
                    let nearestSection = element.closest("section");
                    let nearestFootnote = element.closest("li.footnote");
                    if (nearestFootnote) {
                        popFrameTitleTextParts.push("Footnote", Notes.noteNumber(nearestFootnote));
                        let identifyingSpan = nearestFootnote.querySelector("span[id]:empty");
                        if (identifyingSpan)
                            popFrameTitleTextParts.push(`(#${(identifyingSpan.id)})`);
                    } else if (nearestSection) {
                        //  Section mark (§) for sections.
                        popFrameTitleTextParts.push("&#x00a7;");
                        if (nearestSection.id == "footnotes") {
                            popFrameTitleTextParts.push("Footnotes");
                        } else {
                            popFrameTitleTextParts.push(nearestSection.firstElementChild.textContent);
                        }
                    } else {
                        popFrameTitleTextParts.push(target.hash);
                    }
                }
			}
			popFrameTitleHTML = popFrameTitleTextParts.join(" ");
		}

		/*	This is for section backlinks popups for the base page, and any
			(section or full) backlinks popups for a different page.
		 */
		if (   popFrame.classList.contains("backlinks")
			&& (   target.pathname == location.pathname
				&& [ "#backlinks", "#backlinks-section" ].includes(target.hash)) == false)
			popFrameTitleHTML += " (Backlinks)";

		return Transclude.fillTemplateNamed("pop-frame-title-standard", {
			popFrameTitleLinkHref:  target.href,
			popFrameTitle:          popFrameTitleHTML
		});
    },

	//	Called by: Extracts.preparePopup_LOCAL_PAGE
	preparePopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.preparePopFrame_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popFrame.spawningTarget;

		/*	For local content embed pop-frames, add handler to trigger
			transcludes in source content when they trigger in the pop-frame.
		 */
		if (Content.cachedDataExists(target)) {
			GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", popFrame.updateSourceContentOnTranscludeTriggerHandler = (info) => {
				Content.updateCachedContent(target, (content) => {
					Transclude.allIncludeLinksInContainer(content).filter(includeLink =>
						includeLink.href == info.includeLink.href
					).forEach(includeLink => {
						Transclude.transclude(includeLink, true);
					});

					return true;
				});
			}, { condition: (info) => (   info.source == "transclude"
									   && info.document == popFrame.document) });
			//	Add handler to remove the above handler when pop-frame despawns.
			let suffix = Extracts.popFrameTypeSuffix();
			GW.notificationCenter.addHandlerForEvent(`Pop${suffix}s.pop${suffix}WillDespawn`, (info) => {
				GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", popFrame.updateSourceContentOnTranscludeTriggerHandler);
			}, {
				once: true,
				condition: (info) => (info[`pop${suffix}`] == popFrame)
			});
		}

		return popFrame;
	},

    //  Called by: Extracts.preparePopFrame (as `preparePop${suffix}_${targetTypeName}`)
    preparePopup_LOCAL_PAGE: (popup) => {
        GWLog("Extracts.preparePopup_LOCAL_PAGE", "extracts-content.js", 2);

        let target = popup.spawningTarget;

		//  Do not spawn “full context” popup if the link is visible.
 		if (   Extracts.isFullBacklinkContextLink(target)
 			&& popup.classList.contains("full-page") == false
 			&& Popups.isVisible(targetElementInDocument(target, Extracts.rootDocument)))
			return null;

		/*  Designate popups spawned from section links in the the TOC (for
            special styling).
         */
        if (Extracts.isTOCLink(target))
        	Extracts.popFrameProvider.addClassesToPopFrame(popup, "toc-section");

        return Extracts.preparePopFrame_LOCAL_PAGE(popup);
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_LOCAL_PAGE: (popFrame) => {
        GWLog("Extracts.updatePopFrame_LOCAL_PAGE", "extracts-content.js", 2);

		//	Add page body classes.
		let referenceData = Content.referenceDataForLink(popFrame.spawningTarget);
		Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(referenceData.pageBodyClasses.filter(c => c.startsWith("dropcaps-") == false)));

		//	Update pop-frame title.
		Extracts.updatePopFrameTitle(popFrame);
	},

    //  Called by: Extracts.rewritePopinContent_LOCAL_PAGE
    //  Called by: Extracts.rewritePopupContent_LOCAL_PAGE
    rewritePopFrameContent_LOCAL_PAGE: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_PAGE", "extracts-content.js", 2);

		//	Something failed somehow (probably a transclude error).
		if (isNodeEmpty(contentContainer)) {
			Extracts.postRefreshUpdatePopFrame(popFrame, false);
			return;
		}

		//	Remove empty page-metadata section.
		let pageMetadata = contentContainer.querySelector("#page-metadata");
		if (isNodeEmpty(pageMetadata))
			pageMetadata.remove();

		//	Make first image load eagerly.
		let firstImage = (   contentContainer.querySelector(".page-thumbnail")
						  ?? contentContainer.querySelector("figure img"))
		if (firstImage) {
			firstImage.loading = "eager";
			firstImage.decoding = "sync";
		}

		//	Expand a single collapse block encompassing the top level content.
		if (   isOnlyChild(contentContainer.firstElementChild)
			&& contentContainer.firstElementChild.classList.contains("collapse"))
			expandLockCollapseBlock(contentContainer.firstElementChild);

		/*	In the case where the spawning link points to a specific element
			within the transcluded content, but we’re transcluding the full
			page and not just the block context of the targeted element,
			transclude.js has not marked the targeted element for us already.
			So we must do it here.
		 */
		let target = popFrame.spawningTarget;
		if (   isAnchorLink(target)
			&& popFrame.classList.containsAnyOf([ "full-page", "full-backlink-context" ]))
			highlightTargetElementInDocument(target, popFrame.document);

		//  Scroll to the target.
		Extracts.scrollToTargetedElementInPopFrame(popFrame);
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_PAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopupContent_LOCAL_PAGE", "extracts-content.js", 2);

        //  Make anchorlinks scroll popup instead of opening normally.
		Extracts.constrainLinkClickBehaviorInPopFrame(popup);

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_PAGE(popup, contentContainer);
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopinContent_LOCAL_PAGE: (popin, contentContainer) => {
        GWLog("Extracts.rewritePopinContent_LOCAL_PAGE", "extracts-content.js", 2);

        /*  Make anchorlinks scroll popin instead of opening normally
        	(but only for non-popin-spawning anchorlinks).
         */
		Extracts.constrainLinkClickBehaviorInPopFrame(popin, (link => link.classList.contains("spawns-popin") == false));

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_PAGE(popin, contentContainer);
    }
};

/*=-----------------=*/
/*= AUXILIARY LINKS =*/
/*=-----------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "AUX_LINKS",            // Type name
    "isAuxLinksLink",       // Type predicate function
    "has-content",          // Target classes to add
    "auxLinksForTarget",    // Pop-frame fill function
    "aux-links"             // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isAuxLinksLink: (target) => {
        let auxLinksLinkType = AuxLinks.auxLinksLinkType(target);
        return (   auxLinksLinkType != null
                && target.classList.contains(auxLinksLinkType));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `AUX_LINKS` targets.
        It returns false if the target is to be excluded, true otherwise.
        Excluded targets will not spawn pop-frames.
     */
    //  Called by: Extracts.targets.testTarget (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_AUX_LINKS: (target) => {
        let exclude = false;
        let auxLinksType = AuxLinks.auxLinksLinkType(target);
        let containingAnnotation = target.closest(".annotation");
        if (containingAnnotation) {
            let includedAuxLinksBlock = containingAnnotation.querySelector(`.${auxLinksType}-append`);
            if (includedAuxLinksBlock)
                exclude = true;
        }

        return (!(   Extracts.popFrameProvider == Popins
                  && exclude == true));
    },

    /*  Backlinks, similar-links, etc.
     */
    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    auxLinksForTarget: (target) => {
        GWLog("Extracts.auxLinksForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			class: "include-strict include-spinner-not " + AuxLinks.auxLinksLinkType(target)
		}));
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_AUX_LINKS: (popFrame) => {
        let target = popFrame.spawningTarget;
        let targetPage = AuxLinks.targetOfAuxLinksLink(target);
        let auxLinksLinkType = AuxLinks.auxLinksLinkType(target);
        switch (auxLinksLinkType) {
		case "backlinks":
			return newDocument(`<code>${targetPage}</code><span> (Backlinks)</span>`);
		case "similars":
			return newDocument(`<code>${targetPage}</code><span> (Similar links)</span>`);
		case "link-bibliography":
			return newDocument(`<code>${targetPage}</code><span> (Bibliography)</span>`);
		default:
			return newDocument(`<code>${targetPage}</code>`);
        }
    },

    //  Called by: Extracts.preparePopFrame (as `preparePopFrame_${targetTypeName}`)
    preparePopFrame_AUX_LINKS: (popFrame) => {
        GWLog("Extracts.preparePopFrame_AUX_LINKS", "extracts-content.js", 2);

        let auxLinksLinkType = AuxLinks.auxLinksLinkType(popFrame.spawningTarget);
        if (auxLinksLinkType > "")
            Extracts.popFrameProvider.addClassesToPopFrame(popFrame, auxLinksLinkType);

        return popFrame;
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_AUX_LINKS: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_AUX_LINKS", "extracts-content.js", 2);

		if (Extracts.popFrameProvider == Popups) {
			popFrame.document.querySelectorAll(".backlink-source a:nth-of-type(2)").forEach(fullContextLink => {
				let targetDocument = Extracts.targetDocument(fullContextLink);
				if (targetDocument) {
					let targetElement = targetElementInDocument(fullContextLink, targetDocument);
					fullContextLink.addEventListener("mouseenter", (event) => {
						targetElement.classList.toggle("block-context-highlighted-temp", true);
					});
					fullContextLink.addEventListener("mouseleave", (event) => {
						targetElement.classList.toggle("block-context-highlighted-temp", false);
					});
					GW.notificationCenter.addHandlerForEvent("Popups.popupWillDespawn", (info) => {
						targetElement.classList.toggle("block-context-highlighted-temp", false);
					}, {
						once: true,
						condition: (info) => (info.popup == popFrame)
					});
				}
			});
		}
    }
};

/*=--------------------=*/
/*= DROPCAP INFO LINKS =*/
/*=--------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "DROPCAP_INFO",          // Type name
    "isDropcapInfoLink",     // Type predicate function
    null,                    // Target classes to add
    "dropcapInfoForTarget",  // Pop-frame fill function
    (popFrame) => [          // Pop-frame classes
		"dropcap-info",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isDropcapInfoLink: (target) => {
        return Content.contentTypes.dropcapInfo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    dropcapInfoForTarget: (target) => {
        GWLog("Extracts.dropcapInfoForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "include-strict",
			"data-letter": target.dataset.letter,
			"data-dropcap-type": target.dataset.dropcapType
		}));
    },

    //  Called by: extracts.js (as `preparePopFrame_${targetTypeName}`)
	preparePopFrame_DROPCAP_INFO: (popFrame) => {
		//	Base location is base location of spawning link’s document.
		popFrame.document.baseLocation = baseLocationForDocument(popFrame.spawningTarget.getRootNode());

		return popFrame;
	},
};

/*=-----------=*/
/*= FOOTNOTES =*/
/*=-----------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "FOOTNOTE",           // Type name
    "isFootnoteLink",     // Type predicate function
    null,                 // Target classes to add
    "footnoteForTarget",  // Pop-frame fill function
    (popFrame) => [       // Pop-frame classes
		"footnote",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isFootnoteLink: (target) => {
        return target.classList.contains("footnote-ref");
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    footnoteForTarget: (target) => {
        GWLog("Extracts.footnoteForTarget", "extracts-content.js", 2);

		let includeLink = synthesizeIncludeLink(target, {
			"class": "include-strict include-spinner-not",
			"data-include-selector-not": ".footnote-self-link, .footnote-back"
		})
		includeLink.hash = "#" + Notes.footnoteIdForNumber(Notes.noteNumber(target));
		return newDocument(includeLink);
    },

    //  Called by: extracts.js (as `titleForPopFrame_${targetTypeName}`)
    titleForPopFrame_FOOTNOTE: (popFrame) => {
        let target = popFrame.spawningTarget;
        let footnoteNumber = target.querySelector("sup").textContent;
        let popFrameTitleHTML = `Footnote #${footnoteNumber}`;

        return Extracts.standardPopFrameTitleElementForTarget(target, popFrameTitleHTML);
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_FOOTNOTE: (popup) => {
        let target = popup.spawningTarget;

        /*  Do not spawn footnote popup if the {side|foot}note it points to is
            visible.
         */
        if (Array.from(Notes.allNotesForCitation(target)).findIndex(note => Popups.isVisible(note)) !== -1)
            return null;

        /*  Add event listeners to highlight citation when its footnote
            popup is hovered over.
         */
        popup.addEventListener("mouseenter", (event) => {
            target.classList.toggle("highlighted", true);
        });
        popup.addEventListener("mouseleave", (event) => {
            target.classList.toggle("highlighted", false);
        });
        GW.notificationCenter.addHandlerForEvent("Popups.popupWillDespawn", (info) => {
            target.classList.toggle("highlighted", false);
        }, {
			once: true,
			condition: (info) => (info.popup == popup)
		});

        return popup;
    }
};

/*=-------------------------=*/
/*= CITATIONS CONTEXT LINKS =*/
/*=-------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "CITATION_CONTEXT",           // Type name
    "isCitationContextLink",      // Type predicate function
    null,                         // Target classes to add
    "citationContextForTarget",   // Pop-frame fill function
    (popFrame) => [               // Pop-frame classes
		"citation-context",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isCitationContextLink: (target) => {
        return target.classList.contains("footnote-back");
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    citationContextForTarget: (target) => {
        GWLog("Extracts.citationContextForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-block-context-expanded include-strict include-spinner-not"
        }));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `CITATION_CONTEXT`
        targets. It returns false if the target is to be excluded, true
        otherwise. Excluded targets will not spawn pop-frames.
     */
    //  Called by: extracts.js (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_CITATION_CONTEXT: (target) => {
        return (Extracts.popFrameProvider != Popins);
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_CITATION_CONTEXT: (popup) => {
        let target = popup.spawningTarget;

        //  Do not spawn citation context popup if citation is visible.
        let targetDocument = Extracts.targetDocument(target);
        if (targetDocument) {
        	let targetElement = targetElementInDocument(target, targetDocument);
        	if (   targetElement
        		&& Popups.isVisible(targetElement))
        		return null;
        }

        return popup;
    },

    //  Called by: extracts.js (as `rewritePopupContent_${targetTypeName}`)
    rewritePopupContent_CITATION_CONTEXT: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopupContent_CITATION_CONTEXT", "extracts-content.js", 2);

        //  Highlight citation in popup.
        /*  Remove the .targeted class from a targeted citation (if any)
            inside the popup (to prevent confusion with the citation that
            the spawning link points to, which will be highlighted).
         */
        popup.document.querySelectorAll(".footnote-ref.targeted").forEach(targetedCitation => {
            targetedCitation.classList.remove("targeted");
        });
        //  In the popup, the citation for which context is being shown.
        let citationInPopup = targetElementInDocument(popup.spawningTarget, popup.document);
        //  Highlight the citation.
        citationInPopup.classList.add("targeted");
        //	Remove class that would interfere with styling.
        citationInPopup.classList.remove("block-context-highlighted");

        //  Scroll to the citation.
        Extracts.scrollToTargetedElementInPopFrame(popup);
    }
};

/*=---------------=*/
/*= REMOTE IMAGES =*/
/*=---------------=*/

Extracts.targetTypeDefinitions.insertBefore([
	"REMOTE_IMAGE",          // Type name
	"isRemoteImageLink",     // Type predicate function
	"has-content",           // Target classes to add
	"remoteImageForTarget",  // Pop-frame fill function
	"image object"           // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isRemoteImageLink: (target) => {
        return Content.contentTypes.remoteImage.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    remoteImageForTarget: (target) => {
        GWLog("Extracts.remoteImageForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_REMOTE_IMAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_REMOTE_IMAGE", "extracts-content.js", 2);

		contentContainer.querySelector("img").addEventListener("load", (event) => {
			requestAnimationFrame(() => {
				Extracts.resizeObjectInObjectPopup(popup, "img");
			});
		}, { once: true });
    }
};

/*=---------------=*/
/*= REMOTE VIDEOS =*/
/*=---------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "REMOTE_VIDEO",          // Type name
    "isRemoteVideoLink",     // Type predicate function
    "has-content",           // Target classes to add
    "remoteVideoForTarget",  // Pop-frame fill function
    "video object"           // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isRemoteVideoLink: (target) => {
        return Content.contentTypes.remoteVideo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    remoteVideoForTarget: (target) => {
        GWLog("Extracts.remoteVideoForTarget", "extracts-content.js", 2);

		return newDocument(synthesizeIncludeLink(target, {
			class: "include-strict include-spinner-not"
		}));
    },

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_REMOTE_VIDEO: (popup) => {
		let target = popup.spawningTarget;

		if (Content.contentTypes.remoteVideo.isYoutubeLink(target)) {
			Extracts.popFrameProvider.addClassesToPopFrame(popup, "youtube");
		} else if (Content.contentTypes.remoteVideo.isVimeoLink(target)) {
			Extracts.popFrameProvider.addClassesToPopFrame(popup, "vimeo");
		}

        return popup;
    }
};

/*=--------------------=*/
/*= CONTENT TRANSFORMS =*/
/*=--------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "CONTENT_TRANSFORM",              // Type name
    "isContentTransformLink",         // Type predicate function
	/*	NOTE: At some point, `content-transform` (or some analogous class) will
		be added by the back-end code (or content.js for links in popups), so
		will be removed from the line below.
			—SA 2024-04-15
	 */
    "has-annotation content-transform",  // Target classes to add
    "contentTransformForTarget",      // Pop-frame fill function
    "content-transform"               // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
	isContentTransformLink: (target) => {
		return (   target.classList.contains("content-transform-not") == false
				&& [ "tweet",
					 "wikipediaEntry",
					 "githubIssue"
					 ].findIndex(x => Content.contentTypes[x].matches(target)) !== -1);
	},

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
	contentTransformForTarget: (target) => {
        GWLog("Extracts.contenTransformForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-strict include-spinner-not",
			"data-include-template": "$popFrameTemplate"
        }));
	},

    //  Called by: extracts.js (as `preparePopup_${targetTypeName}`)
    preparePopup_CONTENT_TRANSFORM: (popup) => {
        /*  Do not spawn popup if the transformed content is already visible
            on screen. (This may occur if the target is in a popup that was
            spawned from a backlinks popup for this same content as viewed on
            a tag index page, for example.)
         */
        let escapedLinkURL = CSS.escape(decodeURIComponent(popup.spawningTarget.href));
        let targetAnalogueInLinkBibliography = document.querySelector(`a[id^='link-bibliography'][href='${escapedLinkURL}']`);
        if (targetAnalogueInLinkBibliography) {
            let containingSection = targetAnalogueInLinkBibliography.closest("section");
            if (   containingSection
                && containingSection.querySelector("blockquote")
                && Popups.isVisible(containingSection)) {
                return null;
            }
        }

        return popup;
    },

	//	Called by: Extracts.rewritePopFrameContent (as `updatePopFrame_${targetTypeName}`)
	updatePopFrame_CONTENT_TRANSFORM: (popFrame) => {
        GWLog("Extracts.updatePopFrame_CONTENT_TRANSFORM", "extracts-content.js", 2);

		let referenceData = Content.referenceDataForLink(popFrame.spawningTarget);

        //  Mark pop-frame with content type class.
		Extracts.popFrameProvider.addClassesToPopFrame(popFrame, ...(referenceData.contentTypeClass.split(" ")));

		//	Make anchor-links in Wikipedia content transforms un-clickable.
		if (referenceData.contentTypeClass == "wikipedia-entry")
			Extracts.constrainLinkClickBehaviorInPopFrame(popFrame);

        //  Update pop-frame title.
        Extracts.updatePopFrameTitle(popFrame, referenceData.popFrameTitle);
	}
};

/*=-----------------------=*/
/*= LOCALLY HOSTED VIDEOS =*/
/*=-----------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_VIDEO",          // Type name
    "isLocalVideoLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localVideoForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"video object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalVideoLink: (target) => {
        return Content.contentTypes.localVideo.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localVideoForTarget: (target) => {
        GWLog("Extracts.localVideoForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_VIDEO: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_VIDEO", "extracts-content.js", 2);

		Extracts.resizeObjectInObjectPopup(popup, "video", { loosenSizeConstraints: true });
    }
};

/*=----------------------------=*/
/*= LOCALLY HOSTED AUDIO FILES =*/
/*=----------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_AUDIO",          // Type name
    "isLocalAudioLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localAudioForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"audio object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar no-resize-height"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalAudioLink: (target) => {
        return Content.contentTypes.localAudio.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localAudioForTarget: (target) => {
        GWLog("Extracts.localAudioForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    }
};

/*=-----------------------=*/
/*= LOCALLY HOSTED IMAGES =*/
/*=-----------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_IMAGE",          // Type name
    "isLocalImageLink",     // Type predicate function
    "has-content",          // Target classes to add
    "localImageForTarget",  // Pop-frame fill function
    (popFrame) => [         // Pop-frame classes
		"image object",
		(Extracts.popFrameProvider == Popups
		 ? "mini-title-bar"
		 : "no-footer-bar")
	].join(" ")
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalImageLink: (target) => {
        return Content.contentTypes.localImage.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localImageForTarget: (target) => {
        GWLog("Extracts.localImageForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
			"class": "include-caption-not include-strict include-spinner-not"
        }));
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_LOCAL_IMAGE: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_IMAGE", "extracts-content.js", 2);

		//	Mark sized image pop-frame.
        if (popFrame.document.querySelector("img[width][height]"))
        	Extracts.popFrameProvider.addClassesToPopFrame(popFrame, "dimensions-specified");
    },

    //  Called by: Extracts.rewritePopFrameContent (as `rewritePop${suffix}Content_${targetTypeName}`)
    rewritePopupContent_LOCAL_IMAGE: (popup, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_IMAGE", "extracts-content.js", 2);

		Extracts.resizeObjectInObjectPopup(popup, "img", { loosenSizeConstraints: true });

		//	Non-provider-specific rewrites.
		Extracts.rewritePopFrameContent_LOCAL_IMAGE(popup, contentContainer);
    }
};

/*=--------------------------=*/
/*= LOCALLY HOSTED DOCUMENTS =*/
/*=--------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_DOCUMENT",               // Type name
    "isLocalDocumentLink",          // Type predicate function
    "has-content",                  // Target classes to add
    "localDocumentForTarget",       // Pop-frame fill function
    "local-document object"         // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalDocumentLink: (target) => {
    	return Content.contentTypes.localDocument.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localDocumentForTarget: (target) => {
        GWLog("Extracts.localDocumentForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    },

    /*  This “special testing function” is used to exclude certain targets which
        have already been categorized as (in this case) `LOCAL_DOCUMENT`
        targets. It returns false if the target is to be excluded, true
        otherwise. Excluded targets will not spawn pop-frames.
     */
    //  Called by: extracts.js (as `testTarget_${targetTypeInfo.typeName}`)
    testTarget_LOCAL_DOCUMENT: (target) => {
    	/*	Mobile browsers have no in-browser PDF viewer, so a popin would be
    		pointless, since the file will download anyway.
    	 */
    	if (   Extracts.popFrameProvider == Popins
            && target.pathname.endsWith(".pdf"))
            return false;

        return true;
    },

    //  Called by: extracts.js (as `rewritePopFrameContent_${targetTypeName}`)
    rewritePopFrameContent_LOCAL_DOCUMENT: (popFrame, contentContainer) => {
        GWLog("Extracts.rewritePopFrameContent_LOCAL_DOCUMENT", "extracts-content.js", 2);

		let iframe = popFrame.document.querySelector("iframe");
		if (iframe) {
			iframe.addEventListener("load", (event) => {
				//  Set title of popup from page title, if any.
				let title = iframe.contentDocument.title?.trim();
				if (title > "")
					Extracts.updatePopFrameTitle(popFrame, title);
			}, { once: true });
		}
    }
};

/*=---------------------------=*/
/*= LOCALLY HOSTED CODE FILES =*/
/*=---------------------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "LOCAL_CODE_FILE",              // Type name
    "isLocalCodeFileLink",          // Type predicate function
    "has-content",                  // Target classes to add
    "localCodeFileForTarget",       // Pop-frame fill function
    "local-code-file"               // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isLocalCodeFileLink: (target) => {
    	return Content.contentTypes.localCodeFile.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    localCodeFileForTarget: (target) => {
        GWLog("Extracts.localCodeFileForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    }
};

/*=----------------=*/
/*= OTHER WEBSITES =*/
/*=----------------=*/

Extracts.targetTypeDefinitions.insertBefore([
    "FOREIGN_SITE",             // Type name
    "isForeignSiteLink",        // Type predicate function
    "has-content",              // Target classes to add
    "foreignSiteForTarget",     // Pop-frame fill function
    "foreign-site object"       // Pop-frame classes
], (def => def[0] == "LOCAL_PAGE"));

Extracts = { ...Extracts,
    //  Called by: extracts.js (as `predicateFunctionName`)
    isForeignSiteLink: (target) => {
        return Content.contentTypes.foreignSite.matches(target);
    },

    //  Called by: extracts.js (as `popFrameFillFunctionName`)
    foreignSiteForTarget: (target) => {
        GWLog("Extracts.foreignSiteForTarget", "extracts-content.js", 2);

        return newDocument(synthesizeIncludeLink(target, {
        	class: "include-strict include-spinner-not"
        }));
    }
};

/*=------------------=*/
/*= CONTENT: HELPERS =*/
/*=------------------=*/

Extracts = { ...Extracts,
	/*	Called by: Extracts.rewritePopupContent_LOCAL_IMAGE
	 */
	resizeObjectInObjectPopup: (popup, objectSelector, options) => {
		options = Object.assign({
			width: null,
			height: null,
			loosenSizeConstraints: false
		}, options);

		let object = popup.document.querySelector(objectSelector);
		if (object == null)
			return;

		let specifiedWidth = options.width ?? parseInt(object.getAttribute("width") ?? "0");
		let specifiedHeight = options.height ?? parseInt(object.getAttribute("height") ?? "0");

		let computedStyles = getComputedStyle(document.documentElement);
		let popupMaxWidth = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-max-width"));
		let popupMaxHeight = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-max-height"));
		let popupBorderWidth = parseInt(computedStyles.getPropertyValue("--GW-popups-popup-border-width"));
		let popupTitleBarHeight = popup.classList.contains("mini-title-bar") ? 21 : 31;
		let popupHorizontalPadding = popupBorderWidth * 2;
		let popupVerticalPadding = popupBorderWidth * 2 + popupTitleBarHeight;

		/*	Allow media popups to squeeze the same maximum screen area (defined
			by the --GW-popups-popup-max-width and --GW-popups-popup-max-height
			CSS variables) into more horizontal or vertical space (useful for 
			images that deviate from the standard ~4:3 aspect ratio of popups).
		 */
		if (options.loosenSizeConstraints) {
			let popupWidth = specifiedWidth + popupHorizontalPadding;
			let popupHeight = specifiedHeight + popupVerticalPadding;
			let popupMaxArea = popupMaxWidth * popupMaxHeight;
			popupMaxWidth = Math.sqrt(popupMaxArea / (popupHeight / popupWidth));
			popupMaxHeight = popupMaxWidth * (popupHeight / popupWidth);
			if (popupMaxHeight > window.innerHeight) {
				popupMaxWidth *= window.innerHeight / popupMaxHeight;
				popupMaxHeight = window.innerHeight;
			} else if (popupMaxWidth > window.innerWidth) {
				popupMaxHeight *= window.innerWidth / popupMaxWidth;
				popupMaxWidth = window.innerWidth;
			}
		}

		let objectMaxWidth = popupMaxWidth - popupHorizontalPadding;
		let objectMaxHeight = popupMaxHeight - popupVerticalPadding;

		let height = Math.round(Math.min(Math.min(specifiedWidth, objectMaxWidth) * (specifiedHeight / specifiedWidth), objectMaxHeight));
		let width = Math.round(height * (specifiedWidth / specifiedHeight));

		object.style.width = `${width}px`;
		object.style.height = `${height}px`;

		object.style.setProperty("--aspect-ratio", object.style.aspectRatio);

		if (options.loosenSizeConstraints) {
			popup.style.maxWidth = "unset";
			popup.style.maxHeight = "unset";
		}
	},

	//	Used in: Extracts.setUpContentLoadEventsWithin
	contentLoadHoverDelay: 25,

    //  Called by: extracts.js
    setUpContentLoadEventsWithin: (container) => {
        GWLog("Extracts.setUpContentLoadEventsWithin", "extracts-content.js", 2);

        /*  Get all targets in the container that use Content as a data loading
        	provider. (Currently that is local page links, local fragment links,
        	and local code file links.)
         */
        let allTargetsInContainer = Array.from(container.querySelectorAll("a[class*='has-content'], a[class*='content-transform']")).filter(link =>
        	Content.contentTypeForLink(link) != null
        );

        if (Extracts.popFrameProvider == Popups) {
            //  Add hover event listeners to all the chosen targets.
            allTargetsInContainer.forEach(target => {
                target.removeContentLoadEvents = onEventAfterDelayDo(target, "mouseenter", Extracts.contentLoadHoverDelay, (event) => {
                    //  Do nothing if the content is already loaded.
                    if (Content.cachedDataExists(target) == false)
                        Content.load(target);
                }, {
                	cancelOnEvents: [ "mouseleave" ]
                });
            });

			if (allTargetsInContainer.length > 0) {
				/*  Set up handler to remove hover event listeners from all
					the chosen targets in the document.
					*/
				GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
					allTargetsInContainer.forEach(target => {
						if (target.removeContentLoadEvents) {
							target.removeContentLoadEvents();
							target.removeContentLoadEvents = null;
						}
					});
				}, { once: true });
            }
        } else { // if (Extracts.popFrameProvider == Popins)
            //  Add click event listeners to all the chosen targets.
            allTargetsInContainer.forEach(target => {
                target.addEventListener("click", target.contentLoad_click = (event) => {
                    //  Do nothing if the content is already loaded.
                    if (Content.cachedDataExists(target) == false)
                        Content.load(target);
                });
            });

            /*  Set up handler to remove click event listeners from all
                the annotated targets in the document.
                */
            GW.notificationCenter.addHandlerForEvent("Extracts.cleanupDidComplete", (info) => {
                allTargetsInContainer.forEach(target => {
                    target.removeEventListener("click", target.contentLoad_click);
                });
            }, { once: true });
        }
    },
};
Extracts = { ...Extracts,
	/*****************/
	/*	Configuration.
	 */
	modeOptions: [
		[ "on", "On", "Enable Pop-frames", "Pop-frames Enabled", "Enable link pop-frames.", "message-lines-solid" ],
		[ "off", "Off", "Disable Pop-frames", "Pop-frames Disabled", "Disable link pop-frames.", "message-slash-solid" ],
	],

	selectedModeOptionNote: " [This option is currently selected.]",

	popFramesDisableDespawnDelay: 1000,
	popFramesDisableWidgetFlashStayDuration: 3000,
	popFramesDisableAutoToggleDelay: 1000,

	/******************/
	/*	Infrastructure.
	 */

	modeSelector: null,
	modeSelectorInteractable: true,

	/*************/
	/*	Functions.
	 */

	/******************/
	/*	Mode selection.
	 */

	setMode: (selectedMode) => {
		if (selectedMode == "on")
			Extracts.enableExtractPopFrames();
		else
			Extracts.disableExtractPopFrames();
	},

	//	Called by: Extracts.injectModeSelector
	modeSelectorHTML: (inline = false) => {
		//	Get saved mode setting (or default).
		let currentMode = Extracts.extractPopFramesEnabled() ? "on" : "off";

		let modeSelectorInnerHTML = Extracts.modeOptions.map(modeOption => {
			let [ name, shortLabel, unselectedLabel, selectedLabel, desc, iconName ] = modeOption;
			let selected = (name == currentMode ? " selected" : " selectable");
			let disabled = (name == currentMode ? " disabled" : "");
			unselectedLabel = unselectedLabel.replace("-frame", Extracts.popFrameTypeSuffix());
			selectedLabel = selectedLabel.replace("-frame", Extracts.popFrameTypeSuffix());
			desc = desc.replace("-frame", Extracts.popFrameTypeSuffix());
			if (name == currentMode)
				desc += Extracts.selectedModeOptionNote;
			let label = inline
						? shortLabel
						: (name == currentMode
						   ? selectedLabel 
						   : unselectedLabel);
			return `<button
					 type="button"
					 class="select-mode-${name}${selected}"
					 ${disabled}
					 tabindex="-1"
					 data-name="${name}"
					 title="${desc}"
					 >`
						+ `<span class="icon">${(GW.svg(iconName))}</span>`
						+ `<span
							class="label"
							data-selected-label="${selectedLabel}"
							data-unselected-label="${unselectedLabel}"
							>${label}</span>`
				 + `</button>`;
		  }).join("");

		let selectorTag = (inline ? "span" : "div");
		let selectorId = (inline ? "" : "extracts-mode-selector");
		let selectorClass = ("extracts-mode-selector mode-selector" + (inline ? " mode-selector-inline" : ""));

		return `<${selectorTag} id="${selectorId}" class="${selectorClass}">${modeSelectorInnerHTML}</${selectorTag}>`;
	},

	modeSelectButtonClicked: (event) => {
		GWLog("Extracts.modeSelectButtonClicked", "extracts-options.js", 2);

		let button = event.target.closest("button");

		// Determine which setting was chosen (ie. which button was clicked).
		let selectedMode = button.dataset.name;

		/*	We don’t want clicks to go through if the transition
			between modes has not completed yet, so we disable the
			button temporarily while we’re transitioning between
			modes.
		 */
		doIfAllowed(() => {
			//	Check if this is a click or an accesskey press.
			if (event.pointerId == -1) {
				button.blur();

				GW.pageToolbar.expandToolbarFlashWidgetDoThing("extracts-mode-selector", () => {
					//	Actually change the mode.
					Extracts.setMode(selectedMode);
				});
			} else {
				//	Actually change the mode.
				Extracts.setMode(selectedMode);
			}
		}, Extracts, "modeSelectorInteractable");
	},

	//	Called by: Extracts.setup (extracts.js)
	injectModeSelector: (replacedElement = null) => {
		GWLog("Extracts.injectModeSelector", "extracts-options.js", 1);

		//	Inject the mode selector widget.
		let modeSelector;
		if (replacedElement) {
			modeSelector = elementFromHTML(Extracts.modeSelectorHTML(true));
			replacedElement.replaceWith(modeSelector);
			wrapParenthesizedNodes("inline-mode-selector", modeSelector);
		} else {
			modeSelector = Extracts.modeSelector = GW.pageToolbar.addWidget(Extracts.modeSelectorHTML());
			Extracts.activateModeSelector(modeSelector);
		}
	},

	//	Called by: Extracts.setup (extracts.js)
	activateModeSelector: (modeSelector) => {
		//	Activate mode selector widget buttons.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.addActivateEvent(Extracts.modeSelectButtonClicked);
		});

		//	Register event handler to update mode selector state.
		GW.notificationCenter.addHandlerForEvent("Extracts.didSetMode", (info) => {
			Extracts.updateModeSelectorState(modeSelector);
		});

		//	Update state now.
		Extracts.updateModeSelectorState(modeSelector);
	},

	//	Called by: Extracts.didSetMode event handler
	updateModeSelectorState: (modeSelector = Extracts.modeSelector) => {
		GWLog("Extracts.updateModeSelectorState", "extracts-options.js", 2);

		/*	If the mode selector has not yet been injected, then do nothing.
		 */
		if (modeSelector == null)
			return;

		//	Get saved mode setting (or default).
		let currentMode = Extracts.extractPopFramesEnabled() ? "on" : "off";

		//	Clear current buttons state.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.classList.remove("active");
			button.swapClasses([ "selectable", "selected" ], 0);
			button.disabled = false;

			//	Remove “[This option is currently selected.]” note.
			if (button.title.endsWith(Extracts.selectedModeOptionNote))
				button.title = button.title.slice(0, (-1 * Extracts.selectedModeOptionNote.length));

			//	Reset label text to unselected state.
			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.unselectedLabel;
			}

			//	Clear accesskey.
			button.accessKey = "";
		});

		//	Set the correct button to be selected.
		modeSelector.querySelectorAll(`.select-mode-${currentMode}`).forEach(button => {
			button.swapClasses([ "selectable", "selected" ], 1);
			button.disabled = true;
			button.title += Extracts.selectedModeOptionNote;

			//	Set label text to selected state.
			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.selectedLabel;
			}
		});

		//	Set accesskey.
		let buttons = Array.from(modeSelector.querySelectorAll("button"));
		buttons[(buttons.findIndex(button => button.classList.contains("selected")) + 1) % buttons.length].accessKey = "p";
	},

	//	Called by: extracts.js
	disableExtractPopFramesPopFrameTitleBarButton: () => {
		let button = Extracts.popFrameProvider.titleBarComponents.genericButton();

		button.title = `Disable link pop${(Extracts.popFrameTypeSuffix())}s [currently enabled]`;
		button.innerHTML = Extracts.popFrameProvider == Popups
						   ? GW.svg("eye-slash-solid")
						   : GW.svg("eye-slash-regular");
		button.classList.add("extracts-disable-button");

		button.addActivateEvent((event) => {
			event.stopPropagation();

			button.classList.add("disabled");

			//	Expand toolbar.
			GW.pageToolbar.toggleCollapseState(false);

			setTimeout(() => {
				Extracts.popFrameProvider.cleanup();

				GW.pageToolbar.flashWidget("extracts-mode-selector", {
					flashStayDuration: Extracts.popFramesDisableWidgetFlashStayDuration,
					showSelectedButtonLabel: true,
					highlightSelectedButtonLabelAfterDelay: Extracts.popFramesDisableAutoToggleDelay
				});
				setTimeout(() => {
					//	Actually disable extract pop-frames.
					Extracts.disableExtractPopFrames();

					//	Collapse toolbar, after a delay.
					GW.pageToolbar.toggleCollapseState(true, {
														   delay: GW.pageToolbar.demoCollapseDelay
																+ Extracts.popFramesDisableWidgetFlashStayDuration
																+ GW.pageToolbar.widgetFlashFallDuration
													   });
				}, GW.pageToolbar.widgetFlashRiseDuration + Extracts.popFramesDisableAutoToggleDelay);
			}, Extracts.popFramesDisableDespawnDelay);
		});

		return button;
	},

	extractPopFramesDisabledLocalStorageItemKey: () => {
		return (Extracts.popFrameProvider == Popups
				? Extracts.popupsDisabledLocalStorageItemKey
				: Extracts.popinsDisabledLocalStorageItemKey);
	},

	extractPopFramesEnabled: () => {
		return (localStorage.getItem(Extracts.extractPopFramesDisabledLocalStorageItemKey()) != "true");
	},

	disableExtractPopFrames: () => {
		GWLog("Extracts.disableExtractPopFrames", "extracts-options.js", 1);

		//	Save setting.
		localStorage.setItem(Extracts.extractPopFramesDisabledLocalStorageItemKey(), "true");

		//	Fire event.
		GW.notificationCenter.fireEvent("Extracts.didSetMode");

		//	Run cleanup.
		Extracts.cleanup();
	},

	enableExtractPopFrames: () => {
		GWLog("Extracts.enableExtractPopFrames", "extracts-options.js", 1);

		//	Clear saved setting.
		localStorage.removeItem(Extracts.extractPopFramesDisabledLocalStorageItemKey());

		//	Fire event.
		GW.notificationCenter.fireEvent("Extracts.didSetMode");

		//  Run setup.
		Extracts.setup();

		/*  Since the main document has already loaded, we must trigger the
			processing of targets manually.
		 */
		Extracts.processTargetsInContainer(Extracts.rootDocument);
	},
};
/*	This file should be loaded after all other extracts*.js files.
 */

Extracts.config = {
    /*  Selector for containers within which targets may be found.
     */
    contentContainersSelector: [
    	".markdownBody",
    	"#TOC",
    	"#sidebar"
    ].join(", "),

	/*	Selector for containers within which targets may not be found.
	 */
    excludedContainerElementsSelector: "h1, h2, h3, h4, h5, h6",

	/*	Selector for targets.
	 */
	targetElementsSelector: "a[href]",

	/*	Elements that shouldn’t be targets.
	 */
	excludedElementsSelector: [
		".section-self-link",
		".footnote-self-link",
		".sidenote-self-link",
		"[aria-hidden='true']",
		"[href$='#top']",
		".extract-not"
	].join(", "),

	/*	Don’t display indicator hooks on links in these containers.
	 */
	hooklessLinksContainersSelector: [
		"body.page-index #markdownBody",
		"#sidebar",
		".TOC",
		"#floating-header",
    	"#page-toolbar",
    	".link-widget"
	].join(", ")
};

GW.notificationCenter.fireEvent("Extracts.didLoad");

Extracts.setup();
/*	Typography.js
	(Copyright 2020 Said Achmiz)
	MIT License

	is based on

	https://github.com/kellym/smartquotes.js
	(Copyright 2013 Kelly Martin)
	MIT License

	and

	https://github.com/kronusaturn/lw2-viewer
	(Copyright 2018 kronusaturn)
	MIT License
	*/

Typography = {
	replacements: (types) => {
		let specifiedReplacements = [ ];
		let replacementTypeDefinitions = [
			[ Typography.replacementTypes.QUOTES,		Typography.replacementDefinitionGroups.quotes		],
			[ Typography.replacementTypes.HYPHENS,		Typography.replacementDefinitionGroups.hyphens		],
			[ Typography.replacementTypes.ELLIPSES,		Typography.replacementDefinitionGroups.ellipses		],
			[ Typography.replacementTypes.ARROWS,		Typography.replacementDefinitionGroups.arrows		],
			[ Typography.replacementTypes.WORDBREAKS,	Typography.replacementDefinitionGroups.wordbreaks	],
			[ Typography.replacementTypes.MISC,			Typography.replacementDefinitionGroups.misc			],
			[ Typography.replacementTypes.SOFTHYPHENS,	Typography.replacementDefinitionGroups.softHyphens	],
			[ Typography.replacementTypes.JOINERS,		Typography.replacementDefinitionGroups.joiners		],
			[ Typography.replacementTypes.SEPARATORS,	Typography.replacementDefinitionGroups.separators	],
			[ Typography.replacementTypes.SYMBOLS,		Typography.replacementDefinitionGroups.symbols		]
		];
		for (let [ replacementTypeCode, replacementGroup ] of replacementTypeDefinitions) {
			if (types & replacementTypeCode)
				for (replacement of replacementGroup)
					specifiedReplacements.push(replacement);
		}
		return specifiedReplacements;
	},
	replacementTypes: {
		NONE:			0x0000,
		QUOTES:			0x0001,
		HYPHENS:		0x0002,
		ELLIPSES:		0x0004,
		ARROWS:			0x0008,
		WORDBREAKS:		0x0010,
		MISC:			0x0020,
		SOFTHYPHENS:	0x0040,
		JOINERS:		0x0080,
		SEPARATORS:		0x0100,
		SYMBOLS:        0x0200,
		CLEAN: 			(0x0040 + 0x0080 + 0x0100)
	},
	replacementDefinitionGroups: {
		quotes: [
			// triple prime
			[ /'''/, '\u2034' ],
			// beginning "
			[ /(?<=[\s([]|^)"(?=[^\s?!.,;\/)])/, '\u201c' ],
			// ending "
			[ /(?<=\u201c[^"]*)"(?=[^"]*$|[^\u201c"]*(?=\u201c))/, '\u201d' ],
			// remaining " at end of word
			[ /(?<=[^0-9])"/, '\u201d' ],
			// double quotes
			[ /"(.+?)"/, '\u201c$1\u201d' ],
			// double prime as two single quotes
			[ /''/, '\u2033' ],
			// beginning '
			[ /(?<=\W|^)'(?=\S)/, '\u2018' ],
			// conjunction's possession
			[ /(?<=[a-z0-9])'(?=[a-z])/i, '\u2019' ],
			// abbrev. years like '93
			[ /\u2018(?=(?:[0-9]{2}[^\u2019]*)(?:\u2018(?:[^0-9]|$)|$|\u2019[a-z]))/i, '\u2019' ],
			// ending '
			[ /(?<=(\u2018[^']*)|[a-z])'(?=[^0-9]|$)/i, '\u2019' ],
			// backwards apostrophe
			[ /(?<=\B|^)\u2018(?=([^\u2018\u2019]*\u2019\b)*([^\u2018\u2019]*\B\W[\u2018\u2019]\b|[^\u2018\u2019]*$))/i, '\u2019' ],
			// double prime
			[ /"/, '\u2033' ],
			// prime
			[ /'/, '\u2032' ]
		],
		hyphens: [
			// turn a hyphen surrounded by spaces, between words, into an em-dash
			[ /(?<=[a-z\u201d]) (-) (?=[a-z\u201c])/i, '\u2014' ],
			// turn a hyphen between a space and a quote, into an em-dash
			[ /(?<=[a-z]) (-)(?=\u201d)/i, '\u2014' ],
			[ /(?<=\u201c)(-) (?=[a-z])/i, '\u2014' ],
			// turn a double or triple hyphen, optionally surrounded by spaces, between words, or at the start of a line, into an em-dash
			[ /(?<=[a-z"'“”‘’]|\n) ?(---?) ?(?=[a-z"'“”‘’])/i, '\u2014' ],
			// turn a hyphen surrounded by spaces, between decimal digits, into an en-dash
			[ /(?<=[0-9]) (-) (?=[0-9])/, '\u2013' ]
		],
		ellipses: [
			// Ellipsis rectification.
			[ /(?<=^|\s)\.\.\./, '…' ],
			[ /\.\.\.(?=\s|$)/,  '…' ]
		],
		arrows: [
			// Arrows
			[ /(?<=\s)->(?=\s)/,  '\u2192' ],
			[ /(?<=\s)<-(?=\s)/,  '\u2190' ],
			[ /(?<=\s)=>(?=\s)/,  '\u21d2' ],
			[ /(?<=\s)<=(?=\s)/,  '\u21d0' ],
			[ /(?<=\s)<=>(?=\s)/, '\u21d4' ]
		],
		wordbreaks: [
			// Word-breaks after slashes (for long URLs etc.).
			[ /(?<=.)\/+(?=[^\u200b\/])/, '$&\u200b' ],
		],
		misc: [
			// Convert nbsp to regular space.
			[ /\xa0/, ' ' ],
			// Two spaces after a period is INCORRECT.
			[ /(?<=\w[\.\?\!])[ \u00a0]{2}(?=\w)/, ' ' ],
			// Hyphen followed by a numeral (with an optional space first), becomes an actual minus sign.
			[ /(?<=\s)-( ?)(?=[0-9])/, '\u2212$1' ]
		],
		softHyphens: [
			// Strip soft hyphens.
			[ /\u00ad/, '' ]
		],
		joiners: [
			// Strip joiners.
			[ /\u2060/, '' ]
		],
		separators: [
			// Strip zero-width spaces.
			[ /\u200b|&ZeroWidthSpace;/, '' ],
			// Strip hair spaces.
			[ /\u200a|&hairsp;/, '' ],
		],
		symbols: [
			// Rectify U+2731 HEAVY ASTERISK.
			[ /\u2731/, '*' ]
		]
	},
	processString: (str, replacementTypes = Typography.replacementTypes.NONE, segments = null) => {
		if (segments == null)
			segments = [ str.length ];

		function segmentIndexAtOffset(segments, offset) {
			let currentSegmentStart = 0;
			for (let i = 0; i < segments.length; i++) {
				if (   offset >= currentSegmentStart
					&& offset < currentSegmentStart + segments[i])
					return i;

				currentSegmentStart += segments[i];
			}
			return -1;
		}

		Typography.replacements(replacementTypes).forEach(replacement => {
			let [ pattern, template ] = replacement;

			let globalPattern = new RegExp(pattern.source, pattern.flags + "g");
			let match = null;
			while (match = globalPattern.exec(str)) {
				let oldLength = str.length;
				str = str.replace(pattern, template);
				let lengthChange = str.length - oldLength;

				if (lengthChange == 0)
					continue;

				let segmentAtMatchStart = segmentIndexAtOffset(segments, match.index);
				let segmentAtMatchEnd = segmentIndexAtOffset(segments, match.index + match[0].length - 1);
				if (segmentAtMatchStart == segmentAtMatchEnd) {
					segments[segmentAtMatchStart] += lengthChange;
				} else {
					//	TODO: THIS!
				}
			}
		});

		return str;
	},
	excludedTags: [ 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT' ],
	unmodifiedTags: [ 'CODE '],
	processElement: (element, replacementTypes = Typography.replacementTypes.NONE, rectifyWordBreaks = true) => {
		if (Typography.excludedTags.includes(element.nodeName))
			return null;

		function decomposeElement(element) {
			let text = "";
			let textNodes = [ ];

			if (Typography.excludedTags.includes(element.nodeName))
				return [ text, textNodes ];

			for (let node of element.childNodes) {
				if (node.nodeType === Node.TEXT_NODE) {
					textNodes.push(node);
					text += node.nodeValue;
				} else if (node.childNodes.length > 0) {
					let [ subtext, subnodes ] = decomposeElement(node);
					text += subtext;
					textNodes.splice(textNodes.length, 0, ...subnodes);
				}
			}

			return [ text, textNodes ];
		}

		let [ text, textNodes ] = decomposeElement(element);
		let segments = textNodes.map(node => node.nodeValue.length);
		if (Typography.unmodifiedTags.includes(element.nodeName) == false)
			text = Typography.processString(text, replacementTypes, segments);
		let currentSegmentStart = 0;
		for (let i = 0; i < textNodes.length; i++) {
			textNodes[i].nodeValue = text.slice(currentSegmentStart, currentSegmentStart + segments[i]);
			currentSegmentStart += segments[i];
		}

		//  Transform separators into <wbr> tags.
		if (rectifyWordBreaks)
			Typography.rectifyWordBreaks(element);

		return text;
	},
	rectifyWordBreaks: (element) => {
		let replacements = [ ];
		for (let node of element.childNodes) {
			if (node.nodeType === Node.ELEMENT_NODE) {
				Typography.rectifyWordBreaks(node);
			} else if (node.nodeType === Node.TEXT_NODE) {
				let sepRegExp = new RegExp(Typography.replacementDefinitionGroups.separators.map(x => x[0].source).join("|"), "g");
				let parts = [ ];
				let start = 0;
				let match = null;
				while (match = sepRegExp.exec(node.textContent)) {
					parts.push([ start, match.index ]);
					start = match.index + match[0].length;
				}
				if (parts.length > 0) {
					let replacementNodes = [ ];
					parts.forEach(part => {
						if (part[1] > part[0])
							replacementNodes.push(document.createTextNode(node.textContent.slice(...part)));
						replacementNodes.push(newElement("WBR"));
					});
					if (node.textContent.length > start)
						replacementNodes.push(document.createTextNode(node.textContent.slice(start)));
					replacements.push([ node, replacementNodes ]);
				}
			}
		}
		if (replacements.length > 0) {
			//	Replace.
			replacements.forEach(replacement => {
				let [ replacedNode, replacementNodes ] = replacement;
				replacedNode.parentNode.replaceChild(newDocument(replacementNodes), replacedNode);
			});

			//	Remove all but one of each set of consecutive <wbr> tags.
			function isWBR(node) {
				return (   node.nodeType === Node.ELEMENT_NODE
						&& node.tagName == "WBR");
			}

			function isEmptyTextNode(node) {
				return (   node.nodeType === Node.TEXT_NODE
						&& isNodeEmpty(node) == true);
			}

			let prevNodeIsWBR = false;
			for (let i = 0; i < element.childNodes.length; i++) {
				let node = element.childNodes[i];
				if (isWBR(node) && prevNodeIsWBR == false) {
					prevNodeIsWBR = true;
				} else if (prevNodeIsWBR) {
					if (   isWBR(node) 
						|| isEmptyTextNode(node)) {
						node.remove();
						i--;
					} else {
						prevNodeIsWBR = false;
					}
				}
			}
		}
	}
};
/**
 * @license Hyphenopoly_Loader 5.0.0-beta.4 - client side hyphenation
 * ©2022  Mathias Nater, Güttingen (mathiasnater at gmail dot com)
 * https://github.com/mnater/Hyphenopoly
 *
 * Released under the MIT license
 * https://github.com/mnater/Hyphenopoly/blob/master/LICENSE
 */
/* globals Hyphenopoly:readonly */
window.Hyphenopoly = {};

((w, d, H, o) => {
    "use strict";

    /**
     * Shortcut for new Map
     * @param {any} init - initialiser for new Map
     * @returns {Map}
     */
    const mp = (init) => {
        return new Map(init);
    };

    const scriptName = "Hyphenopoly_Loader.js";
    const thisScript = d.currentScript.src;
    const store = sessionStorage;
    let mainScriptLoaded = false;

    /**
     * The main function runs the feature test and loads Hyphenopoly if
     * necessary.
     */
    const main = (() => {
        const shortcuts = {
            "ac": "appendChild",
            "ce": "createElement",
            "ct": "createTextNode"
        };

        /**
         * Create deferred Promise
         *
         * From http://lea.verou.me/2016/12/resolve-promises-externally-with-
         * this-one-weird-trick/
         * @return {promise}
         */
        const defProm = () => {
            let res = null;
            let rej = null;
            const promise = new Promise((resolve, reject) => {
                res = resolve;
                rej = reject;
            });
            promise.resolve = res;
            promise.reject = rej;
            return promise;
        };

        let stylesNode = null;

        /**
         * Define function H.hide.
         * This function hides (state = 1) or unhides (state = 0)
         * the whole document (mode == 0) or
         * each selected element (mode == 1) or
         * text of each selected element (mode == 2) or
         * nothing (mode == -1)
         * @param {integer} state - State
         * @param {integer} mode  - Mode
         */
        H.hide = (state, mode) => {
            if (state === 0) {
                if (stylesNode) {
                    stylesNode.remove();
                }
            } else {
                let vis = "{visibility:hidden!important}";
                stylesNode = d[shortcuts.ce]("style");
                let myStyle = "";
                if (mode === 0) {
                    myStyle = "html" + vis;
                } else if (mode !== -1) {
                    if (mode === 2) {
                        vis = "{color:transparent!important}";
                    }
                    o.keys(H.s.selectors).forEach((sel) => {
                        myStyle += sel + vis;
                    });
                }
                stylesNode[shortcuts.ac](d[shortcuts.ct](myStyle));
                d.head[shortcuts.ac](stylesNode);
            }
        };

        const tester = (() => {
            let fakeBody = null;
            return {

                /**
                 * Append fakeBody with tests to document
                 * @returns {Object|null} The body element or null, if no tests
                 */
                "ap": () => {
                    if (fakeBody) {
                        d.documentElement[shortcuts.ac](fakeBody);
                        return fakeBody;
                    }
                    return null;
                },

                /**
                 * Remove fakeBody
                 * @returns {undefined}
                 */
                "cl": () => {
                    if (fakeBody) {
                        fakeBody.remove();
                    }
                },

                /**
                 * Create and append div with CSS-hyphenated word
                 * @param {string} lang Language
                 * @returns {undefined}
                 */
                "cr": (lang) => {
                    if (H.cf.langs.has(lang)) {
                        return;
                    }
                    fakeBody = fakeBody || d[shortcuts.ce]("body");
                    const testDiv = d[shortcuts.ce]("div");
                    const ha = "hyphens:auto";
                    testDiv.lang = lang;
                    testDiv.style.cssText = `visibility:hidden;-webkit-${ha};-ms-${ha};${ha};width:48px;font-size:12px;line-height:12px;border:none;padding:0;word-wrap:normal`;
                    testDiv[shortcuts.ac](
                        d[shortcuts.ct](H.lrq.get(lang).wo.toLowerCase())
                    );
                    fakeBody[shortcuts.ac](testDiv);
                }
            };
        })();

        /**
         * Checks if hyphens (ev.prefixed) is set to auto for the element.
         * @param {Object} elm - the element
         * @returns {Boolean} result of the check
         */
        const checkCSSHyphensSupport = (elmStyle) => {
            const h = elmStyle.hyphens ||
                elmStyle.webkitHyphens ||
                elmStyle.msHyphens;
            return (h === "auto");
        };

        H.res = {
            "he": mp()
        };

        /**
         * Load hyphenEngines to H.res.he
         *
         * Make sure each .wasm is loaded exactly once, even for fallbacks
         * Store a list of languages to by hyphenated with each .wasm
         * @param {string} lang The language
         * @returns {undefined}
         */
        const loadhyphenEngine = (lang) => {
            const fn = H.lrq.get(lang).fn;
            H.cf.pf = true;
            H.cf.langs.set(lang, "H9Y");
            if (H.res.he.has(fn)) {
                H.res.he.get(fn).l.push(lang);
            } else {
                H.res.he.set(
                    fn,
                    {
                        "l": [lang],
                        "w": w.fetch(H.paths.patterndir + fn + ".wasm", {"credentials": H.s.CORScredentials})
                    }
                );
            }
        };
        H.lrq.forEach((value, lang) => {
            if (value.wo === "FORCEHYPHENOPOLY" || H.cf.langs.get(lang) === "H9Y") {
                loadhyphenEngine(lang);
            } else {
                tester.cr(lang);
            }
        });
        const testContainer = tester.ap();
        if (testContainer) {
            testContainer.querySelectorAll("div").forEach((n) => {
                if (checkCSSHyphensSupport(n.style) && n.offsetHeight > 12) {
                    H.cf.langs.set(n.lang, "CSS");
                } else {
                    loadhyphenEngine(n.lang);
                }
            });
            tester.cl();
        }
        const hev = H.hev;
        if (H.cf.pf) {
            H.res.DOM = new Promise((res) => {
                if (d.readyState === "loading") {
                    d.addEventListener(
                        "DOMContentLoaded",
                        res,
                        {
                            "once": true,
                            "passive": true
                        }
                    );
                } else {
                    res();
                }
            });
            H.hide(1, H.s.hide);
            H.timeOutHandler = w.setTimeout(() => {
                H.hide(0, null);
                // eslint-disable-next-line no-console
                console.info(scriptName + " timed out.");
            }, H.s.timeout);
            if (mainScriptLoaded) {
                H.main();
            } else {
                // Load main script
                const script = d[shortcuts.ce]("script");
                script.src = H.paths.maindir + "Hyphenopoly.js";
                d.head[shortcuts.ac](script);
                mainScriptLoaded = true;
            }
            H.hy6ors = mp();
            H.cf.langs.forEach((langDef, lang) => {
                if (langDef === "H9Y") {
                    H.hy6ors.set(lang, defProm());
                }
            });
            H.hy6ors.set("HTML", defProm());
            H.hyphenators = new Proxy(H.hy6ors, {
                "get": (target, key) => {
                    return target.get(key);
                },
                "set": () => {
                    // Inhibit setting of hyphenators
                    return true;
                }
            });
            (() => {
                if (hev && hev.polyfill) {
                    hev.polyfill();
                }
            })();
        } else {
            (() => {
                if (hev && hev.tearDown) {
                    hev.tearDown();
                }
                w.Hyphenopoly = null;
            })();
        }
        (() => {
            if (H.cft) {
                store.setItem(scriptName, JSON.stringify(
                    {
                        "langs": [...H.cf.langs.entries()],
                        "pf": H.cf.pf
                    }
                ));
            }
        })();
    });

    H.config = (c) => {
        /**
         * Sets default properties for an Object
         * @param {object} obj - The object to set defaults to
         * @param {object} defaults - The defaults to set
         * @returns {object}
         */
        const setDefaults = (obj, defaults) => {
            if (obj) {
                o.entries(defaults).forEach(([k, v]) => {
                    // eslint-disable-next-line security/detect-object-injection
                    obj[k] = obj[k] || v;
                });
                return obj;
            }
            return defaults;
        };

        H.cft = Boolean(c.cacheFeatureTests);
        if (H.cft && store.getItem(scriptName)) {
            H.cf = JSON.parse(store.getItem(scriptName));
            H.cf.langs = mp(H.cf.langs);
        } else {
            H.cf = {
                "langs": mp(),
                "pf": false
            };
        }

        const maindir = thisScript.slice(0, (thisScript.lastIndexOf("/") + 1));
        const patterndir = maindir + "patterns/";
        H.paths = setDefaults(c.paths, {
            maindir,
            patterndir
        });
        H.s = setDefaults(c.setup, {
            "CORScredentials": "include",
            "hide": "all",
            "selectors": {".hyphenate": {}},
            "timeout": 1000
        });
        // Change mode string to mode int
        H.s.hide = ["all", "element", "text"].indexOf(H.s.hide);
        if (c.handleEvent) {
            H.hev = c.handleEvent;
        }

        const fallbacks = mp(o.entries(c.fallbacks || {}));
        H.lrq = mp();
        o.entries(c.require).forEach(([lang, wo]) => {
            H.lrq.set(lang.toLowerCase(), {
                "fn": fallbacks.get(lang) || lang,
                wo
            });
        });

        main();
    };
})(window, document, Hyphenopoly, Object);
/* Miscellaneous JS functions which run after the page loads to rewrite or adjust parts of the page. */
/* author: Said Achmiz */
/* license: MIT */

/*************/
/* CLIPBOARD */
/*************/

/*******************************************/
/*  Set up copy processors in main document.
 */
doWhenDOMContentLoaded(() => {
    registerCopyProcessorsForDocument(document);
});


/********************/
/* ID-BASED LOADING */
/********************/

/***************************************************************************/
/*	If the URL pathname is in /ref/, load content indicated by the id (i.e., 
	the rest of the path).
 */
addContentLoadHandler(GW.contentLoadHandlers.loadReferencedIdentifier = (eventInfo) => {
    GWLog("loadReferencedIdentifier", "rewrite.js", 1);

	let pageContentContainer = eventInfo.container.querySelector("#markdownBody") ?? eventInfo.container;

	/********************/
	/*	Helper functions.
	 */

	let urlForMappingFile = (basename) => {
		return URLFromString(  "/metadata/annotation/id/"
							 + basename 
							 + ".json?v="
							 + GW.refMappingFileVersion);
	};

	let updatePageTitleElements = (newTitleText) => {
		eventInfo.document.querySelectorAll("title, header h1").forEach(element => {
			element.innerHTML = newTitleText;
		});
	};

	let injectHelpfulErrorMessage = (errorMessageHTML) => {
		pageContentContainer.appendChild(elementFromHTML(`<div class="smallcaps-not"><p>${errorMessageHTML}</p></div>`));
	};

	let activateIncludeLinks = () => {
		GW.contentInjectHandlers.handleTranscludes({
			source: "loadReferencedIdentifier",
			container: pageContentContainer,
			document: eventInfo.document
		});
	};

	/*	The `message` argument may optionally be a 2-element array of strings 
		(the first element being the singular-case message, to be used if there 
		is only one result; the second being the plural-case message, to be 
		used if there are multiple results). Otherwise, it should be a string.
	 */
	let injectIdPrefixMatches = (message, mapping, ref) => {
		let idPrefixMatches = Object.entries(mapping).filter(entry => 
			   entry[0].startsWith(ref)
			&& entry[0] != ref
		);
		if (idPrefixMatches.length > 0) {
			if (typeof message == "object")
				message = idPrefixMatches.length == 1 ? message[0] : message[1];
			injectHelpfulErrorMessage(message);
			let includeLinkClass = idPrefixMatches.length == 1 
								   ? "include-annotation" 
								   : "include-annotation-partial";
			pageContentContainer.appendChild(elementFromHTML(
				  `<ul>`
				+ idPrefixMatches.map(entry => (
					  `<li><p>`
					+ `<a href="/ref/${entry[0]}">${entry[0]}</a>: `
					+ synthesizeIncludeLink(entry[1], {
						"class": "link-annotated ${includeLinkClass}",
						"data-include-selector-not": ".data-field.date, .aux-links-field-container"
					  }, {
					  	innerHTML: `<code>${entry[1]}</code>`
					  }).outerHTML
					+ `</p></li>`
				  )).join("")
				+ `</ul>`));
			activateIncludeLinks();
		}
	};

	let injectUrlPrefixMatches = (matches) => {
		injectHelpfulErrorMessage(`${matches.length} matches found:`);
		pageContentContainer.appendChild(elementFromHTML(
			  `<ul>`
			+ matches.map(entry => (
				  `<li><p>`
				+ synthesizeIncludeLink(entry[0], {
					"class": "link-annotated include-annotation"
				  }, {
					innerHTML: `<code>${entry[0]}</code>`
				  }).outerHTML
				+ `</p></li>`
			  )).join("")
			+ `</ul>`));
		activateIncludeLinks();
	};

	let injectHelpfulSuggestion = (url) => {
		pageContentContainer.appendChild(elementFromHTML("<hr>"));
		pageContentContainer.appendChild(elementFromHTML(
			  `<p>`
			+ `You can try browsing <a 
									 href="/doc/index" 
									 class="link-annotated link-page backlink-not icon-not" 
									 title="‘Essays’, Gwern 2009"
									 >documents by <strong>tag</strong></a>, `
			+ `or <a 
				   href="/index" 
				   class="link-annotated link-page backlink-not icon-not" 
				   title="'Essays', Gwern 2009"
				   >return to the <strong>main page</strong></a>, `
			+ `or search the site:`
			+ `</p>`));

		//	Synthesize and inject search page include-link.
		let searchPageIncludeLink = pageContentContainer.appendChild(synthesizeIncludeLink("/static/google-search.html", {
			"data-link-content-type": "local-document"
		}));

		//	Add inject handler.
		GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (contentDidInjectEventInfo) => {
			//	Function to set the proper mode (auto, light, dark) in the iframe.
			let updateSearchIframeMode = (iframe) => {
				iframe.contentDocument.querySelector("#search-styles-dark").media = DarkMode.mediaAttributeValues[DarkMode.currentMode()];
			};

			let iframe = contentDidInjectEventInfo.container.querySelector("iframe");
			iframe.classList.add("search");
			iframe.addEventListener("load", (event) => {
				let searchField = iframe.contentDocument.querySelector("input.search");

				//	Pre-fill the search field with the URL (if given).
				if (url)
					searchField.value = url;

				//	Set proper mode.
				updateSearchIframeMode(iframe);

				//	Add handler to update search iframe when switching modes.
				GW.notificationCenter.addHandlerForEvent("DarkMode.didSetMode", iframe.darkModeDidSetModeHandler = (info) => {
					updateSearchIframeMode(iframe)
				});

				//	Enable “search where” functionality.
				let searchWhereSelector = iframe.contentDocument.querySelector("#search-where-selector");
				searchWhereSelector.querySelectorAll("input").forEach(radioButton => {
					radioButton.addEventListener("change", (event) => {
						searchWhereSelector.querySelectorAll("input").forEach(otherRadioButton => {
							otherRadioButton.removeAttribute("checked");
						});
						radioButton.setAttribute("checked", "");
					});
				});

				//	Enable submit override (to make site search work).
				iframe.contentDocument.querySelector(".searchform").addEventListener("submit", (event) => {
					event.preventDefault();

					let form = event.target;
					form.querySelector("input.query").value = searchWhereSelector.querySelector("input[checked]").value
															+ " "
															+ form.querySelector("input.search").value;
					form.submit();
				});
			}, { once: true });
		}, {
			condition: (info) => (info.includeLink = searchPageIncludeLink),
			once: true
		});

		//	Trigger include-link.
		Transclude.triggerTransclude(searchPageIncludeLink, {
			source: "loadReferencedIdentifier",
			container: pageContentContainer,
			document: eventInfo.document
		});
	};

	/***************************/
	/*	Main /ref/ logic begins.
	 */

	let ref = decodeURIComponent(eventInfo.loadLocation.pathname.slice("/ref/".length));
	if (ref.length == 0) {
		injectHelpfulErrorMessage("No URL or ID specified.");
		injectHelpfulSuggestion();
	} else if (ref.startsWithAnyOf([ "http://", "https://", "/"])) {
		//	Strip origin from local URLs.
		let url = URLFromString(ref);
		if (url.hostname == location.hostname)
			ref = url.pathname + url.hash;

		//	Retrieve the big URL-to-id mapping file.
		doAjax({
			location: urlForMappingFile("all"),
			responseType: "json",
			onSuccess: (event) => {
				//	Get all prefix matches.
				let urlPrefixMatches = Object.entries(event.target.response).filter(entry => entry[0].startsWith(ref));
				if (urlPrefixMatches.length > 1) {
					/*	If multiple matches, list them all, transcluding 
						annotations where available (attempt in all cases, and
						those that fail will just become regular links).
					 */
					updatePageTitleElements("Unknown Reference");
					injectUrlPrefixMatches(urlPrefixMatches);
					injectHelpfulSuggestion(ref);
				} else if (urlPrefixMatches.length == 1) {
					//	If only one match, redirect to the matching /ref/ page.
					document.head.appendChild(elementFromHTML(`<link rel="canonical" href="${URLFromString(urlPrefixMatches.first[1]).href}">`));
					location = URLFromString("/ref/" + urlPrefixMatches.first[1]);				
				} else {
					//	If no matches at all...
					updatePageTitleElements("Invalid Query");
					injectHelpfulErrorMessage(`No annotation exists for URL <code>${ref}</code>.`);
					injectHelpfulSuggestion(ref);
				}
			}
		});
	} else {
		//	Normalize to lowercase, and update URL bar, if need be.
		let normalizedRef = ref.toLowerCase();
		if (normalizedRef != ref)
			relocate("/ref/" + normalizedRef);

		//	Retrieve id-to-URL mapping file (sliced by initial character).
		let mappingFileBasename = /^[a-zA-Z0-9_-]$/.test(normalizedRef.slice(0, 1)) 
								  ? normalizedRef.slice(0, 1) 
								  : "-";
		doAjax({
			location: urlForMappingFile(mappingFileBasename),
			responseType: "json",
			onSuccess: (event) => {
				let urlString = event.target.response[normalizedRef];
				if (urlString == null) {
					updatePageTitleElements("Invalid Query");
					injectHelpfulErrorMessage(`ID <code>${normalizedRef}</code> does not exist.`);
					injectIdPrefixMatches([ "Perhaps you want this:", "Perhaps you want one of these:" ], event.target.response, normalizedRef);
					injectHelpfulSuggestion(normalizedRef.replace(/-/g, " ").replace(" et al", "").split(" ").filter(x => /^([0-9]{1,3}|[0-9]{5,})$/.test(x) == false).join(" "));
				} else {
					//	Synthesize and inject include-link.
					let annotationIncludeLink = pageContentContainer.appendChild(synthesizeIncludeLink(event.target.response[normalizedRef], {
						class: "link-annotated"
					}));

					//	Add include-link load fail handler.
					GW.notificationCenter.addHandlerForEvent("Rewrite.contentDidChange", (contentDidChangeEventInfo) => {
						annotationIncludeLink.remove();
						updatePageTitleElements("Invalid Query");
						injectHelpfulErrorMessage(  `No annotation exists for ID <code>${normalizedRef}</code>`
												  + ` (<a href="${urlString}"><code>${URLFromString(urlString).href}</code></a>).`);
						injectIdPrefixMatches([ "Perhaps you want this instead:", "Perhaps you want one of these instead:" ], event.target.response, normalizedRef);
						injectHelpfulSuggestion(urlString);
					}, {
						condition: (info) => (   info.source == "transclude.loadingFailed"
											  && info.includeLink == annotationIncludeLink),
						once: true
					});

					//	Trigger include-link.
					Transclude.triggerTransclude(annotationIncludeLink, {
						container: pageContentContainer,
						document: eventInfo.document
					}, {
						doWhenDidLoad: (info) => {
							updatePageTitleElements(Annotations.referenceDataForLink(info.includeLink).popFrameTitle);
							document.head.appendChild(elementFromHTML(`<link rel="canonical" href="${URLFromString(urlString).href}">`));
						}
					});
				}
			}
		});
	}
}, "transclude", (info) => (info.loadLocation?.pathname.startsWith("/ref/") == true));


/*************/
/* AUX-LINKS */
/*************/

/***************************************************/
/*	Strip IDs from links in backlink context blocks.
 */
addContentInjectHandler(GW.contentInjectHandlers.anonymizeLinksInBacklinkContextBlocks = (eventInfo) => {
    GWLog("anonymizeLinksInBacklinkContextBlocks", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("a[id]").forEach(link => {
		link.id = "";
	});
}, "rewrite", (info => (   info.container.closest(".backlink-context") != null
						|| info.container.matches(".section-backlinks-include-wrapper"))));

/******************************************************************************/
/*	Returns the backlinks block for a section or a footnote (creating and 
	injecting the backlinks block if one does not already exist). (Note that,
	in the latter case, a GW.contentDidInject event will need to be fired for
	the backlinks block, once all modifications to it are complete; and its 
	wrapper, a div.section-backlinks-include-wrapper, will need to be unwrapped.)
 */
function getBacklinksBlockForSectionOrFootnote(targetBlock, containingDocument) {
	let backlinksBlock = targetBlock.querySelector(".section-backlinks");
	if (backlinksBlock == null) {
		//	Backlinks block.
		backlinksBlock = newElement("DIV", { "class": "section-backlinks", "id": `${targetBlock.id}-backlinks` });

		//	Label.
		let sectionLabelLinkTarget = baseLocationForDocument(containingDocument).pathname + "#" + targetBlock.id;
		let sectionLabelHTML = targetBlock.tagName == "SECTION"
							   ? `“${(targetBlock.firstElementChild.textContent)}”`
							   : `footnote <span class="footnote-number">${(Notes.noteNumber(targetBlock))}</span>`;
		backlinksBlock.append(elementFromHTML(  `<p class="aux-links-list-label backlinks-list-label">`
											  + `<strong>`
											  + `<a
											  	  href="/design#backlink"
											  	  class="icon-special link-annotated"
											  	  data-link-icon="arrows-pointing-inwards-to-dot"
											  	  data-link-icon-type="svg"
											  	  >Backlinks (<span class="backlink-count">0</span>)</a> for `
											  + `<a 
											  	  href="${sectionLabelLinkTarget}" 
											  	  class="link-page"
											  	  >${sectionLabelHTML}</a>:`
											  + `</strong></p>`));

		//	List.
		backlinksBlock.append(newElement("UL", { "class": "aux-links-list backlinks-list" }));

		//	Collapse wrapper.
		let backlinksBlockCollapseWrapper = newElement("DIV", { "class": "collapse aux-links-append section-backlinks-container" });
		backlinksBlockCollapseWrapper.append(backlinksBlock);

		//	Include wrapper.
		let backlinksBlockIncludeWrapper = newElement("DIV", { "class": "include-wrapper section-backlinks-include-wrapper" });
		backlinksBlockIncludeWrapper.append(backlinksBlockCollapseWrapper);

		//	Inject.
		let targetParentElement = targetBlock.classList.contains("collapse")
								  ? (targetBlock.querySelector(".collapse-content-wrapper") ?? targetBlock)
								  : targetBlock;
		let targetNextSiblingElement = null;
		if (targetBlock.tagName == "SECTION")
			targetNextSiblingElement = targetBlock.querySelector("section");
		targetParentElement.insertBefore(backlinksBlockIncludeWrapper, targetNextSiblingElement);
	}

	return backlinksBlock;
}

/**************************************************************************/
/*	Update the parenthesized count of backlink entries, display in the list 
	label graf of a backlinks block.
 */
function updateBacklinksCountDisplay(backlinksBlock) {
	let countDisplay = backlinksBlock.querySelector(".backlink-count");
	if (countDisplay == null)
		return;

	countDisplay.innerHTML = backlinksBlock.querySelectorAll(".backlinks-list > li").length;
}

/*************************************/
/*	Add within-page section backlinks.
 */
addContentInjectHandler(GW.contentInjectHandlers.addWithinPageBacklinksToSectionBacklinksBlocks = (eventInfo) => {
    GWLog("addWithinPageBacklinksToSectionBacklinksBlocks", "rewrite.js", 1);

	let excludedContainersSelector = [
		"#hidden-sidenote-storage",
		".sidenote-column",
		".aux-links-list"
	].join(", ");
	if (eventInfo.container.closest(excludedContainersSelector) != null)
		return;

	let excludedLinkContainersSelector = [
		"#page-metadata",
		".aux-links-append"
	].join(", ");
	let excludedTargetContainersSelector = [
		"#backlinks-section",
		"#similars-section",
		"#link-bibliography-section"
	].join(", ");

	let backlinksBySectionId = { };
	let mainContentContainer = eventInfo.document.querySelector("#markdownBody") ?? eventInfo.document.querySelector(".markdownBody");
	mainContentContainer.querySelectorAll("a.link-self").forEach(link => {
		if (link.closest(excludedLinkContainersSelector) != null)
			return;

		let targetBlock = mainContentContainer.querySelector(selectorFromHash(link.hash))?.closest("section, li.footnote");
		if (   targetBlock != null
			&& targetBlock.matches(excludedTargetContainersSelector) == false) {
			if (backlinksBySectionId[targetBlock.id] == null)
				backlinksBySectionId[targetBlock.id] = [ targetBlock, [ ] ];

			backlinksBySectionId[targetBlock.id][1].push(link);
		}
	});

	let pageTitle = Content.referenceDataForLink(eventInfo.loadLocation).pageTitle;
	for (let [ targetBlock, linksToTargetBlock ] of Object.values(backlinksBySectionId)) {
		let sectionBacklinksBlock = getBacklinksBlockForSectionOrFootnote(targetBlock, eventInfo.document);
		let sectionBacklinksBlockIncludeWrapper = sectionBacklinksBlock.closest(".section-backlinks-include-wrapper");

		//	Inject the backlink entries...
		for (let link of linksToTargetBlock) {
			let backlinkEntry = elementFromHTML(  `<li><p class="backlink-source">`
												+ `<a 
													href="${link.pathname}" 
													class="backlink-not link-self link-annotated"
													>${pageTitle}</a> (`
												+ `<a 
													href="#${link.id}"
													class="backlink-not link-self extract-not"
													>context</a>`
												+ `):</p>`
												+ `<blockquote class="backlink-context"><p>`
												+ `<a
													href="${link.pathname}"
													class="backlink-not include-block-context-expanded collapsible"
													data-target-id="${link.id}"
													>[backlink context]</a>`
												+ `</p></blockquote>`
												+ `</li>`);

			/*	If we are injecting into an existing section backlinks block, 
				then a separate inject event must be fired for the created 
				backlink.
			 */
			if (sectionBacklinksBlockIncludeWrapper == null) {
				let backlinkEntryIncludeWrapper = newElement("DIV", { "class": "include-wrapper" });
				backlinkEntryIncludeWrapper.append(backlinkEntry);
				sectionBacklinksBlock.querySelector(".backlinks-list").append(backlinkEntryIncludeWrapper);

				//	Clear loading state of all include-links.
				Transclude.allIncludeLinksInContainer(backlinkEntryIncludeWrapper).forEach(Transclude.clearLinkState);

				//	Fire inject event.
				let flags = GW.contentDidInjectEventFlags.clickable;
				if (eventInfo.document == document)
					flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
				GW.notificationCenter.fireEvent("GW.contentDidInject", {
					source: "transclude.section-backlinks",
					contentType: "backlinks",
					container: backlinkEntryIncludeWrapper,
					document: eventInfo.document,
					loadLocation: eventInfo.loadLocation,
					flags: flags
				});

				unwrap(backlinkEntryIncludeWrapper);
			} else {
				sectionBacklinksBlock.querySelector(".backlinks-list").append(backlinkEntry);
			}
		}

		//	Update displayed count.
		updateBacklinksCountDisplay(sectionBacklinksBlock);

		if (sectionBacklinksBlockIncludeWrapper != null) {
			//	Fire load event.
			GW.notificationCenter.fireEvent("GW.contentDidLoad", {
				source: "transclude.section-backlinks",
				contentType: "backlinks",
				container: sectionBacklinksBlockIncludeWrapper,
				document: eventInfo.document,
				loadLocation: eventInfo.loadLocation
			});

			//	Fire inject event.
			let flags = GW.contentDidInjectEventFlags.clickable;
			if (eventInfo.document == document)
				flags |= GW.contentDidInjectEventFlags.fullWidthPossible;
			GW.notificationCenter.fireEvent("GW.contentDidInject", {
				source: "transclude.section-backlinks",
				contentType: "backlinks",
				container: sectionBacklinksBlockIncludeWrapper,
				document: eventInfo.document,
				loadLocation: eventInfo.loadLocation,
				flags: flags
			});

			unwrap(sectionBacklinksBlockIncludeWrapper);
		}
	}

	if (eventInfo.document == document)
		Content.invalidateCachedContent(eventInfo.loadLocation);
}, "rewrite", (info) => (   info.document == document
						 && info.contentType == "localPage"
						 && location.pathname.endsWithAnyOf([ "/index", "/" ]) == false));

/****************************************************************************/
/*	When an annotation is transcluded into a page, and some of the backlinks 
	for the annotated page are from the page into which the annotation is
	transcluded, the “full context” links become pointless, and should become
	just “context” (as in synthesized within-page backlinks), and likewise 
	should not spawn pop-frames.
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifyLocalizedBacklinkContextLinks = (eventInfo) => {
    GWLog("rectifyLocalizedBacklinkContextLinks", "rewrite.js", 1);

	eventInfo.container.querySelectorAll(".backlink-source .link-self:not(.link-annotated)").forEach(backlinkContextLink => {
		backlinkContextLink.innerHTML = "context";
		backlinkContextLink.classList.add("extract-not");
	});
}, "rewrite", (info => (   info.document == document
						&& info.contentType == "backlinks"
						&& info.source != "transclude.section-backlinks")));

/*************************************************************************/
/*  Add “backlinks” link to start of section popups, when that section has
    a backlinks block.
 */
addContentInjectHandler(GW.contentInjectHandlers.injectBacklinksLinkIntoLocalSectionPopFrame = (eventInfo) => {
    GWLog("injectBacklinksLinkIntoLocalSectionPopFrame", "rewrite.js", 1);

    let containingPopFrame = Extracts.popFrameProvider.containingPopFrame(eventInfo.container);
    if (   containingPopFrame.classList.contains("local-page") == true
        && containingPopFrame.classList.contains("full-page") == false) {
        let section = eventInfo.container.querySelector("section");
        if (section == null)
            return;

        let backlinksBlock = eventInfo.container.querySelector(`#${(CSS.escape(section.id))}-backlinks`);
        if (backlinksBlock == null)
            return;

        //  Construct link and enclosing block.
        let backlinksLink = newElement("A", {
            "class": "aux-links backlinks",
            "href": "#" + backlinksBlock.id,
            "data-link-icon": "arrows-pointing-inwards-to-dot",
            "data-link-icon-type": "svg"
        }, {
            "innerHTML": "backlinks"
        });
        let sectionMetadataBlock = newElement("P", {
            "class": "section-metadata"
        });
        sectionMetadataBlock.append(backlinksLink);
        section.insertBefore(sectionMetadataBlock, section.children[1]);

        //  Make a click on the link uncollapse the backlinks block.
        backlinksLink.addActivateEvent((event) => {
            if (isWithinCollapsedBlock(backlinksBlock)) {
                GW.notificationCenter.addHandlerForEvent("Collapse.collapseStateDidChange", (info) => {
                    revealElement(backlinksBlock);
                }, {
                    once: true,
                    condition: (isWithinCollapsedBlock(backlinksBlock) == false)
                });
            } else {
                requestAnimationFrame(() => {
                    revealElement(backlinksBlock);
                });
            }
        });
    }
}, "rewrite", (info) => (info.context == "popFrame"));

/**************************************************************************/
/*  Remove aux-links list labels when transcluding aux-links lists into the
	aux-links sections of a page (Backlinks, Similars, Bibliography).
 */
addContentInjectHandler(GW.contentInjectHandlers.removeAuxLinksListLabelsInAuxLinksSections = (eventInfo) => {
    GWLog("removeAuxLinksListLabelsInAuxLinksSections", "rewrite.js", 1);

	let auxLinksTypes = [
		"backlinks",
		"similars",
		"link-bibliography"
	];
	let auxLinksListLabelSelector = auxLinksTypes.map(auxLinksType =>
		`#${auxLinksType} > .aux-links-list-label, #${auxLinksType} > .columns > .aux-links-list-label`
	).join(", ");

	let auxLinksListLabel = eventInfo.container.querySelector(auxLinksListLabelSelector);
	if (auxLinksListLabel)
		auxLinksListLabel.remove();
}, "rewrite", (info) => (info.source == "transclude"));


/*********/
/* LISTS */
/*********/

GW.layout.orderedListTypes = [
    "decimal",
    "lower-alpha",
    "upper-alpha",
    "lower-roman",
    "upper-roman",
    "lower-greek"
];

/*****************************************************************************/
/*  Returns the type (CSS `list-item` counter value type) of an <ol> element.
 */
function orderedListType(list) {
    if (list?.tagName != "OL")
        return null;

    for (let type of GW.layout.orderedListTypes)
        if (list.classList.contains(`list-type-${type}`))
            return type;

    return null;
}

/************************************************************************/
/*  Sets the type (CSS `list-item` counter value type) of an <ol> element.
 */
function setOrderedListType(list, type) {
    if (list?.tagName != "OL")
        return;

    for (let type of GW.layout.orderedListTypes)
        list.classList.remove(`list-type-${type}`);

    list.classList.add(`list-type-${type}`);
}

/*******************************************************************/
/*  Returns the nesting level (an integer in [1,listCyclePeriod]) of
    a <ul> element.
 */
function unorderedListLevel(list) {
    if (list?.tagName != "UL")
        return 0;

    let prefix = "list-level-";

    return (parseInt(Array.from(list.classList).find(c => c.startsWith(prefix))?.slice(prefix.length)) || 1);
}

/***********************************************************/
/*  Sets CSS class matching nesting level of a <ul> element.
 */
function setUnorderedListLevel(list, level) {
    if (list?.tagName != "UL")
        return;

    let prefix = "list-level-";

    list.swapClasses([ Array.from(list.classList).find(c => c.startsWith(prefix)), `${prefix}${level}` ], 1);
}

/***********************************/
/*  Designate list type via a class.
 */
addContentInjectHandler(GW.contentInjectHandlers.designateListTypes = (eventInfo) => {
    GWLog("designateListTypes", "rewrite.js", 1);

    //  Workaround for case-insensitivity of CSS selectors.
    eventInfo.container.querySelectorAll("ol[type]").forEach(list => {
        switch (list.type) {
        case '1':
            setOrderedListType(list, "decimal");
            break;
        case 'a':
            setOrderedListType(list, "lower-alpha");
            break;
        case 'A':
            setOrderedListType(list, "upper-alpha");
            break;
        case 'i':
            setOrderedListType(list, "lower-roman");
            break;
        case 'I':
            setOrderedListType(list, "upper-roman");
            break;
        case 'α':
            setOrderedListType(list, "lower-greek");
            break;
        default:
            break;
        }
    });

    //  If not explicitly specified, cycle between these three list types.
    eventInfo.container.querySelectorAll("ol:not([type])").forEach(list => {
        let enclosingList = list.parentElement?.closest("ol");
        let enclosingListType = enclosingList?.parentElement?.matches("section#footnotes")
                                ? null
                                : orderedListType(enclosingList);

        switch (enclosingListType) {
        case "decimal":
            setOrderedListType(list, "upper-roman");
            break;
        case "upper-roman":
            setOrderedListType(list, "lower-alpha");
            break;
        case "lower-alpha":
        default:
            setOrderedListType(list, "decimal");
            break;
        }
    });

    //  Set list levels.
    let listCyclePeriod = 3;
    eventInfo.container.querySelectorAll("ul").forEach(list => {
        setUnorderedListLevel(list, (unorderedListLevel(list.parentElement?.closest("ul")) % listCyclePeriod) + 1);
    });
}, ">rewrite");

/*****************************************************************/
/*  Wrap text nodes and inline elements in list items in <p> tags.
 */
addContentLoadHandler(GW.contentLoadHandlers.paragraphizeListTextNodes = (eventInfo) => {
    GWLog("paragraphizeListTextNodes", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("li").forEach(listItem => {
        if (listItem.closest(".TOC"))
            return;

        paragraphizeTextNodesOfElementRetainingMetadata(listItem);
    });
}, "rewrite");

/**********************************************/
/*  Rectify styling/structure of list headings.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyListHeadings = (eventInfo) => {
    GWLog("rectifyListHeadings", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("p > strong:only-child").forEach(boldElement => {
        if (   boldElement.parentElement.childNodes.length == 2
            && boldElement.parentElement.firstChild == boldElement
            && boldElement.parentElement.lastChild.nodeType == Node.TEXT_NODE
            && boldElement.parentElement.lastChild.nodeValue == ":") {
            boldElement.parentElement.lastChild.remove();
            boldElement.lastTextNode.nodeValue += ":";
        }
    });
}, "rewrite");


/***************/
/* BLOCKQUOTES */
/***************/

/*************************************************************************/
/*  Returns the nesting level (an integer in [1,blockquoteCyclePeriod]) of
    a <blockquote> element.
 */
function blockquoteLevel(blockquote) {
    if (blockquote?.tagName != "BLOCKQUOTE")
        return 0;

    let prefix = "blockquote-level-";

    return (parseInt(Array.from(blockquote.classList).find(c => c.startsWith(prefix))?.slice(prefix.length)) || 1);
}

/*******************************************************************/
/*  Sets CSS class matching nesting level of a <blockquote> element.
 */
function setBlockquoteLevel(blockquote, level) {
    if (blockquote?.tagName != "BLOCKQUOTE")
        return;

    let prefix = "blockquote-level-";

    blockquote.swapClasses([ Array.from(blockquote.classList).find(c => c.startsWith(prefix)), `${prefix}${level}` ], 1);
}

/******************************************/
/*  Designate blockquote level via a class.
 */
addContentInjectHandler(GW.contentInjectHandlers.designateBlockquoteLevels = (eventInfo) => {
    GWLog("designateBlockquoteLevels", "rewrite.js", 1);

    let blockquoteCyclePeriod = 6;
    eventInfo.container.querySelectorAll("blockquote").forEach(blockquote => {
        setBlockquoteLevel(blockquote, (blockquoteLevel(blockquote.parentElement?.closest("blockquote")) % blockquoteCyclePeriod) + 1);
    });
}, ">rewrite");


/**********/
/* TABLES */
/**********/

/**********************************************/
/*  Remove Pandoc-inserted <colgroup> elements.
 */
addContentLoadHandler(GW.contentLoadHandlers.deleteColgroups = (eventInfo) => {
    GWLog("deleteColgroups", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("colgroup").forEach(colgroup => {
        colgroup.remove();
    });
}, "rewrite");

/**************************************************************************/
/*  If there are tables, import tablesorter.js (if need be) and make tables
    sortable.
 */
addContentInjectHandler(GW.contentInjectHandlers.makeTablesSortable = (eventInfo) => {
    GWLog("makeTablesSortable", "rewrite.js", 1);

    if (eventInfo.container.querySelector("table") == null)
        return;

    //  Import tablesorter.js, if need be.
    let scriptTag = document.querySelector("script[src*='/static/js/tablesorter.js']");
    if (scriptTag == null) {
        scriptTag = newElement("SCRIPT", {
            "type": "text/javascript",
            "src": "/static/js/tablesorter.js"
        });
        document.body.appendChild(scriptTag);
    }

    let sortTables = (eventInfo) => {
        jQuery(".table:not(.table-sort-not) table", eventInfo.document).tablesorter();
    };

    if (window["jQuery"]) {
        sortTables(eventInfo);
    } else {
        GW.notificationCenter.addHandlerForEvent("Tablesorter.didLoad", (info) => {
            sortTables(eventInfo);
        }, { once: true });
    }
}, ">rewrite");

/************************************************************************/
/*  Wrap each table in a div.table-wrapper and a div.table-scroll-wrapper
    (for layout purposes).
 */
addContentLoadHandler(GW.contentLoadHandlers.wrapTables = (eventInfo) => {
    GWLog("wrapTables", "rewrite.js", 1);

    wrapAll("table", ".table-wrapper", {
        useExistingWrapper: true,
        root: eventInfo.container
    });
    wrapAll("table", ".table-scroll-wrapper", {
        useExistingWrapper: false,
        root: eventInfo.container
    });

    /*  Move .width-full class from the outer .table-wrapper down to the inner
        .table-scroll-wrapper. (This is done so that the `wrapFullWidthTables`
        content inject handler may work properly.)
     */
    eventInfo.container.querySelectorAll(".table-scroll-wrapper").forEach(tableScrollWrapper => {
        let tableWrapper = tableScrollWrapper.closest(".table-wrapper");
        transferClasses(tableWrapper, tableScrollWrapper, [ "width-full" ]);
    });
}, "rewrite");

/****************************************************/
/*  Rectify full-width table wrapper class structure:

    div.table-wrapper.table.width-full
        div.table-scroll-wrapper
            table

    or

    div.table-wrapper.collapse
        div.collapse-content-wrapper.table.width-full
            div.table-scroll-wrapper
                table
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifyFullWidthTableWrapperStructure = (eventInfo) => {
    GWLog("rectifyFullWidthTableWrapperStructure", "rewrite.js", 1);

    wrapAll(".table-scroll-wrapper.width-full", ".table", {
        useExistingWrapper: true,
        moveClasses: [ "width-full" ],
        root: eventInfo.container
    });
}, "rewrite", (info) => info.fullWidthPossible);


/***********/
/* FIGURES */
/***********/

/******************************************************************************/
/*  Add observers to transform thumbnails into full-sized images if page layout
    demands it.
 */
addContentInjectHandler(GW.contentInjectHandlers.addSwapOutThumbnailEvents = (eventInfo) => {
    GWLog("addSwapOutThumbnailEvents", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("img[data-src-size-full]").forEach(image => {
        let thumbnailSize = Images.thumbnailSizeFromURL(image.src);

        lazyLoadObserver(() => {
            resizeObserver(() => {
                if (thumbnailSize < image.clientWidth * window.devicePixelRatio) {
                    Images.unthumbnailifyImage(image);
                    return false;
                } else if (Images.isThumbnail(image) == false) {
                    return false;
                }
            }, image);
        }, image, {
            root: scrollContainerOf(image),
            rootMargin: "100%"
        });
    });
}, "eventListeners");

/******************************************************************************/
/*  Request image inversion and outlining judgments for images in the loaded 
	content. (We omit from this load handler those GW.contentDidLoad events 
	which are fired when we construct templated content from already extracted 
	reference data, as by then it is already too late; there is no time to send 
	an invertOrNot / outlineOrNot API request and receive a response, before 
	the image must be displayed. Instead, requesting inversion and outlining 
	judgments for images in templated content is handled by the data source 
	object for that content (either Content, in content.js, or Annotations, in 
	annotations.js).)
 */
addContentLoadHandler(GW.contentLoadHandlers.requestImageInversionJudgments = (eventInfo) => {
    GWLog("requestImageInversionJudgments", "rewrite.js", 1);

    //  Request image inversion judgments from invertOrNot.
    requestImageInversionJudgmentsForImagesInContainer(eventInfo.container);

    //  Request image outlining judgments from outlineOrNot.
    requestImageOutliningJudgmentsForImagesInContainer(eventInfo.container);
}, ">rewrite", (info) => (info.source != "transclude"));

/*****************************************************************************/
/*	Apply image inversion judgment, if one is available, to the given image;
	otherwise, add a handler to apply a judgment that becomes available later.
 */
function applyImageInversionJudgmentNowOrLater(image) {
	if (   applyImageInversionJudgment(image) == false
		&& image.inversionJudgmentAvailabilityHandler == null) {
		/*	If no inversion judgment has been applied, there may yet be hope
			for this image; add another listener to wait for additional 
			image inversion judgments to become available in the future.
		 */
		GW.notificationCenter.addHandlerForEvent("GW.imageInversionJudgmentsAvailable", image.inversionJudgmentAvailabilityHandler = (info) => {
			if (applyImageInversionJudgment(image)) {
				GW.notificationCenter.removeHandlerForEvent("GW.imageInversionJudgmentsAvailable", image.inversionJudgmentAvailabilityHandler);
				image.inversionJudgmentAvailabilityHandler = null;
			}
		});
	}
}

/*****************************************************************************/
/*	Apply image outlining judgment, if one is available, to the given image;
	otherwise, add a handler to apply a judgment that becomes available later.
 */
function applyImageOutliningJudgmentNowOrLater(image) {
	let propagateClassesToFigure = (image) => {
		image.closest("figure").swapClasses([ "outline-not", "outline" ], outliningJudgmentForImage(image) ? 1 : 0);
	};

	if (applyImageOutliningJudgment(image)) {
		propagateClassesToFigure(image);
	} else if (   outliningJudgmentHasBeenAppliedToImage(image) == false
			   && image.outliningJudgmentAvailabilityHandler == null) {
		/*	If no outlining judgment has been applied, there may yet be hope
			for this image; add another listener to wait for additional 
			image outlining judgments to become available in the future.
		 */
		GW.notificationCenter.addHandlerForEvent("GW.imageOutliningJudgmentsAvailable", image.outliningJudgmentAvailabilityHandler = (info) => {
			if (applyImageOutliningJudgment(image)) {
				propagateClassesToFigure(image);
				GW.notificationCenter.removeHandlerForEvent("GW.imageOutliningJudgmentsAvailable", image.outliningJudgmentAvailabilityHandler);
				image.outliningJudgmentAvailabilityHandler = null;
			}
		});
	}
}

/***************************************************************************/
/*  Apply image inversion judgments (received from the invertOrNot API) and
	image outlining judgments (received from the outlineOrNot API) to images 
	in the loaded content, if available.
 */
addContentInjectHandler(GW.contentInjectHandlers.applyImageInversionAndOutliningJudgments = (eventInfo) => {
    GWLog("applyImageInversionAndOutliningJudgments", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("figure img").forEach(applyImageInversionJudgmentNowOrLater);
    eventInfo.container.querySelectorAll("figure img").forEach(applyImageOutliningJudgmentNowOrLater);
}, "rewrite");

/******************************************************************/
/*  Wrap text nodes and inline elements in figcaptions in <p> tags.
 */
addContentLoadHandler(GW.contentLoadHandlers.paragraphizeFigcaptionTextNodes = (eventInfo) => {
    GWLog("paragraphizeFigcaptionTextNodes", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("figcaption").forEach(paragraphizeTextNodesOfElementRetainingMetadata);
}, "rewrite");

/***************************************************************************/
/*  Make sure that the figcaption, alt-text, and title are, collectively, as
    useful as possible (i.e., ensure that neither the alt-text nor the title
    duplicate the contents of the figcaption).
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyImageAuxText = (eventInfo) => {
    GWLog("rectifyImageAuxText", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("figure img").forEach(image => {
        let figcaption = image.closest("figure").querySelector("figcaption");
        if (figcaption == null)
            return;

        let [ captionText, titleText, altText ] = [
            figcaption.cloneNode(true),
            newElement("SPAN", null, { "innerHTML": image.getAttribute("title") }),
            newElement("SPAN", null, { "innerHTML": image.getAttribute("alt") }),
        ].map(element => {
            if (element)
                Typography.processElement(element, Typography.replacementTypes.CLEAN|Typography.replacementTypes.QUOTES);

            return element.textContent.trim();
        });

        /*  If the ‘title’ attribute merely duplicates the caption, but the
            ‘alt’ attribute has something different (and nonempty), then copy
            the ‘alt’ to the ‘title’.
         */
        if (   titleText == captionText
            && altText != captionText
            && altText > "")
            image.title = altText;

        /*  As above, but vice-versa (copy ‘title’ to ‘alt’, if appropriate).
         */
        if (   altText == captionText
            && titleText != captionText
            && titleText > "")
            image.alt = titleText;
    });
}, "rewrite");

/*******************************/
/*  Wrap bare images in figures.
 */
addContentLoadHandler(GW.contentLoadHandlers.wrapImages = (eventInfo) => {
    GWLog("wrapImages", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("p > img:only-child").forEach(image => {
        unwrap(image.parentElement);
    });

    let exclusionSelector = [
        "td",
        "th",
        ".footnote-back"
    ].join(", ");
    wrapAll("img", (image) => {
        if (   image.classList.contains("figure-not")
            || image.closest(exclusionSelector) != null
            || image.closest("figure") != null)
            return;

        wrapElement(image, "figure");
    }, {
        root: eventInfo.container
    });
}, "rewrite");

/*****************************************************************************/
/*	Inject the page thumbnail image into the page abstract (or the abstract of
	a full-page pop-frame.
 */
addContentInjectHandler(GW.contentInjectHandlers.injectThumbnailIntoPageAbstract = (eventInfo) => {
    GWLog("injectThumbnailIntoPageAbstract", "rewrite.js", 1);

	let pageAbstract = eventInfo.container.querySelector(".abstract blockquote");
	if (   pageAbstract == null
		|| previousBlockOf(pageAbstract) != null)
		return;

	//	Designate page abstract.
	pageAbstract.classList.add("page-abstract");

	if (pageAbstract.querySelector(".page-thumbnail-figure") != null)
		return;

	//	Insert page thumbnail into page abstract.
	let referenceData = Content.referenceDataForLink(eventInfo.loadLocation);
	if (referenceData.pageThumbnailHTML != null) {
		let pageThumbnailFigure = pageAbstract.insertBefore(newElement("FIGURE", {
			class: "page-thumbnail-figure " + (eventInfo.context == "popFrame" ? "float-right" : "float-not")
		}, {
			innerHTML: referenceData.pageThumbnailHTML
		}), (eventInfo.context == "popFrame"
			 ? pageAbstract.firstElementChild
			 : null));
		let pageThumbnail = pageThumbnailFigure.querySelector("img");
		wrapElement(pageThumbnail, "span.image-wrapper.img");
		if (eventInfo.context == "popFrame")
			Images.thumbnailifyImage(pageThumbnail);

		//	Invert, or not.
		applyImageInversionJudgmentNowOrLater(pageThumbnail);
	}

	if (eventInfo.container == document.main)
		Content.invalidateCachedContent(eventInfo.loadLocation);
}, "rewrite", (info) => (   info.container == document.main
						 || (   info.context == "popFrame"
						 	 && Extracts.popFrameProvider == Popups
						 	 && Extracts.popFrameProvider.containingPopFrame(info.container).classList.contains("full-page"))));

/******************************************************************************/
/*  Set, in CSS, the media (image/video) dimensions that are specified in HTML.
 */
function setMediaElementDimensions(mediaElement, fixWidth = false, fixHeight = false) {
    let width = mediaElement.getAttribute("width");
    let height = mediaElement.getAttribute("height");

    mediaElement.style.aspectRatio = mediaElement.dataset.aspectRatio ?? `${width} / ${height}`;

    if (mediaElement.maxHeight == null) {
        //  This should match `1rem`.
        let baseFontSize = GW.isMobile() ? "18" : "20";

        /*  This should match the `max-height` property value for all images in
            figures (the `figure img` selector; see initial.css).
         */
        mediaElement.maxHeight = window.innerHeight - (8 * baseFontSize);
    }

    if (mediaElement.maxHeight)
        width = Math.round(Math.min(width, mediaElement.maxHeight * (width/height)));

    if (fixWidth) {
        mediaElement.style.width = `${width}px`;
    }
    if (fixHeight) {
        //  Nothing, for now.
    }
}

GW.dimensionSpecifiedMediaElementSelector = [
    "img[width][height]:not([src$='.svg'])",
    "video[width][height]"
].map(x => `figure ${x}`).join(", ");

/**************************************************************/
/*  Prevent reflow for floats, reduce reflow for other figures.
 */
addContentLoadHandler(GW.contentLoadHandlers.setMediaElementDimensions = (eventInfo) => {
    GWLog("setMediaElementDimensions", "rewrite.js", 1);

    //  Set specified dimensions in CSS.
    eventInfo.container.querySelectorAll(GW.dimensionSpecifiedMediaElementSelector).forEach(mediaElement => {
        let fixWidth = (   mediaElement.classList.containsAnyOf([ "float-left", "float-right" ])
                        || mediaElement.closest("figure")?.classList.containsAnyOf([ "float-left", "float-right" ]));
        setMediaElementDimensions(mediaElement, fixWidth);
    });

    //  Also ensure that SVGs get rendered as big as possible.
    eventInfo.container.querySelectorAll("figure img[src$='.svg']").forEach(svg => {
        svg.style.width = "100vw";
        svg.style.aspectRatio = svg.dataset.aspectRatio;
    });
}, "rewrite");

/************************************************************/
/*  Prevent reflow due to lazy-loaded media (images, videos).
 */
addContentInjectHandler(GW.contentInjectHandlers.updateMediaElementDimensions = (eventInfo) => {
    GWLog("updateMediaElementDimensions", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(GW.dimensionSpecifiedMediaElementSelector).forEach(mediaElement => {
        setMediaElementDimensions(mediaElement, true);
    });
}, "rewrite", (info) => (   info.context == "popFrame"
						 && Extracts.popFrameProvider.containingPopFrame(info.container).classList.contains("object")) == false);

/************************************************************************/
/*  Set image dimensions from inline-specified image data (e.g., base64).
 */
addContentInjectHandler(GW.contentInjectHandlers.setImageDimensionsFromImageData = (eventInfo) => {
    GWLog("setImageDimensionsFromImageData", "rewrite.js", 1);

    /*  If an image doesn’t have dimensions set, but image data is already
        available (because the source is a data: URI), we can determine
        dimensions once the image “loads” (i.e., ‘load’ event fires, when
        browser parses the data: attribute).
     */
    eventInfo.container.querySelectorAll("figure img:not([width])").forEach(image => {
        if (image.loadHandler)
            return;

        image.addEventListener("load", image.loadHandler = (event) => {
            image.setAttribute("width", image.naturalWidth);
            image.setAttribute("height", image.naturalHeight);
            image.setAttribute("data-aspect-ratio", `${image.naturalWidth} / ${image.naturalHeight}`);

            setMediaElementDimensions(image);

            //  Ensure proper interaction with image-focus.
            if (image.classList.contains("focusable"))
                ImageFocus.designateSmallImageIfNeeded(image);
        }, { once: true });
    });
}, "eventListeners");

/************************************************************************/
/*  Ensure media (image, video) dimensions update when device is rotated.
 */
addContentInjectHandler(GW.contentInjectHandlers.addOrientationChangeMediaElementDimensionUpdateEvents = (eventInfo) => {
    GWLog("addOrientationChangeMediaElementDimensionUpdateEvents", "rewrite.js", 1);

    let mediaElements = eventInfo.container.querySelectorAll(GW.dimensionSpecifiedMediaElementSelector);

    doWhenMatchMedia(GW.mediaQueries.portraitOrientation, "Rewrite.updateMediaElementDimensionsWhenOrientationChanges", (mediaQuery) => {
        mediaElements.forEach(mediaElement => {
            mediaElement.maxHeight = null;
        });
        requestAnimationFrame(() => {
            mediaElements.forEach(mediaElement => {
                mediaElement.style.width = "";
                setMediaElementDimensions(mediaElement, true);
            });
        });
    });
}, "eventListeners", (info) => (   info.context == "popFrame"
								&& Extracts.popFrameProvider.containingPopFrame(info.container).classList.contains("object")) == false);

/********************************/
/*  Inject wrappers into figures.
 */
addContentLoadHandler(GW.contentLoadHandlers.wrapFigures = (eventInfo) => {
    GWLog("wrapFigures", "rewrite.js", 1);

    let mediaSelector = "img, audio, video";

    eventInfo.container.querySelectorAll("figure").forEach(figure => {
        let media = figure.querySelector(mediaSelector);
        if (media == null)
            return;

        //  Create a wrapper for the figure contents (media plus caption).
        let outerWrapper = figure.appendChild(newElement("SPAN", { "class": "figure-outer-wrapper" }));

        //  Re-insert the (possibly wrapped) media into the figure.
        figure.querySelectorAll(mediaSelector).forEach(mediaElement => {
            let mediaBlock = (   mediaElement.closest(".image-row-wrapper")
                              ?? mediaElement.closest(".image-wrapper")
                              ?? mediaElement);
            outerWrapper.appendChild(mediaBlock);

			//	Ensure proper wrapping.
            if (   mediaBlock == mediaElement
            	|| (   mediaBlock.matches(".image-wrapper") == false
            		&& mediaElement.closest(".image-wrapper") == null))
            	mediaBlock = wrapElement(mediaElement, "span.image-wrapper." + mediaElement.tagName.toLowerCase());
        });

        //  Wrap the caption (if any) in a caption wrapper.
        let caption = figure.querySelector("figcaption");
        if (caption)
	        outerWrapper.appendChild(newElement("SPAN", { "class": "caption-wrapper" })).appendChild(caption);
    });
}, "rewrite");

/***************************************************************************/
/*	Designate whether the media element backdrop should be inverted (back to
	a light color) in dark mode.
 */
addContentInjectHandler(GW.contentInjectHandlers.designateImageBackdropInversionStatus = (eventInfo) => {
    GWLog("designateImageBackdropInversionStatus", "rewrite.js", 1);

    let mediaSelector = _π("figure", " ", [ "img", "audio", "video" ]).join(", ");

	eventInfo.container.querySelectorAll(mediaSelector).forEach(mediaElement => {
		if (mediaElement.matches("audio")) {
			mediaElement.classList.add("dark-mode-invert");		
		} else {
			let wrapper = mediaElement.closest(".image-wrapper");
			if (mediaElement.classList.containsAnyOf([ "invert", "invert-auto" ]) == false)
				wrapper.classList.add("dark-mode-invert");
		}
	});
}, ">rewrite");

/******************************************************************************/
/*  Figure captions might be empty if they are generated by including the
    annotation abstract of an annotated media include link, but the abstract is
    actually empty (because it’s a partial annotation).
 */
addContentLoadHandler(GW.contentLoadHandlers.removeEmptyFigureCaptions = (eventInfo) => {
    GWLog("removeEmptyFigureCaptions", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("figcaption").forEach(figcaption => {
        if (isNodeEmpty(figcaption, { alsoExcludeSelector: "a" }))
            figcaption.remove();
    });
}, "rewrite");

/*****************************************************************************/
/*  Allow for specifying figure classes by setting classes on a media element.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyFigureClasses = (eventInfo) => {
    GWLog("rectifyFigureClasses", "rewrite.js", 1);

    let mediaSelector = "img, audio, video";

    eventInfo.container.querySelectorAll("figure").forEach(figure => {
        let media = figure.querySelector(mediaSelector);
        if (media == null)
            return;

        //  Tag the figure with the first (or only) media element’s classes.
        [ "float-left", "float-right", "outline-not", "image-focus-not" ].forEach(imgClass => {
            if (media.classList.contains(imgClass)) {
                figure.classList.add(imgClass);
                media.classList.remove(imgClass);
            }
        });

        media.classList.remove("float");
    });
}, "rewrite");

/********************************/
/*  Don’t float solitary figures.
 */
addContentInjectHandler(GW.contentInjectHandlers.deFloatSolitaryFigures = (eventInfo) => {
    GWLog("deFloatSolitaryFigures", "rewrite.js", 1);

    let floatClasses = [ "float-left", "float-right" ];
    eventInfo.container.querySelectorAll(floatClasses.map(x => `figure.${x}:only-child`).join(", ")).forEach(figure => {
        if (isOnlyChild(figure))
            figure.classList.remove(...floatClasses);
    });
}, "rewrite");

/***********************************************************************/
/*  Prepare full-width (class `width-full`) figures; add listeners, etc.
 */
addContentInjectHandler(GW.contentInjectHandlers.prepareFullWidthFigures = (eventInfo) => {
    GWLog("prepareFullWidthFigures", "rewrite.js", 1);

    let fullWidthClass = "width-full";

    let allFullWidthMedia = eventInfo.container.querySelectorAll(`figure img.${fullWidthClass}, figure video.${fullWidthClass}`);
    allFullWidthMedia.forEach(fullWidthMedia => {
        fullWidthMedia.closest("figure").classList.toggle(fullWidthClass, true);
    });

    //  Constrain caption width to width of media element.
    let constrainCaptionWidth = (fullWidthMedia) => {
        let caption = fullWidthMedia.closest("figure").querySelector(".caption-wrapper");
        if (caption)
            caption.style.maxWidth = fullWidthMedia.offsetWidth > 0
                                     ? fullWidthMedia.offsetWidth + "px"
                                     : fullWidthMedia.closest(".markdownBody").offsetWidth + "px";
    };

    //  Add ‘load’ listener for lazy-loaded media.
    allFullWidthMedia.forEach(fullWidthMedia => {
        fullWidthMedia.addEventListener("load", fullWidthMedia.loadListener = (event) => {
            constrainCaptionWidth(fullWidthMedia);
            fullWidthMedia.loadListener = null;
        }, { once: true });
    });

    doWhenPageLayoutComplete(() => {
        /*  Update ‘load’ listener for any lazy-loaded media which has not
            already loaded (as it might cause re-layout of e.g. sidenotes). Do
            this only after page layout is complete, to avoid spurious re-layout
            at initial page load.
         */
        allFullWidthMedia.forEach(fullWidthMedia => {
            constrainCaptionWidth(fullWidthMedia);
            if (fullWidthMedia.loadListener) {
                fullWidthMedia.removeEventListener("load", fullWidthMedia.loadListener);
                fullWidthMedia.addEventListener("load", (event) => {
                    constrainCaptionWidth(fullWidthMedia);
                    GW.notificationCenter.fireEvent("Rewrite.fullWidthMediaDidLoad", {
                        mediaElement: fullWidthMedia
                    });
                }, { once: true });
            }
        });

        //  Add listener to update caption max-width when window resizes.
        addWindowResizeListener(event => {
            allFullWidthMedia.forEach(constrainCaptionWidth);
        }, {
            name: "constrainFullWidthMediaCaptionWidthOnWindowResizeListener"
        });
    });
}, "rewrite", (info) => info.fullWidthPossible);

/******************************************************************************/
/*  There is no browser native lazy loading for <video> tag `poster` attribute,
    so we implement it ourselves.
 */
addContentInjectHandler(GW.contentInjectHandlers.lazyLoadVideoPosters = (eventInfo) => {
    GWLog("lazyLoadVideoPosters", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("video:not([poster])").forEach(video => {
    	let videoURL = URLFromString(video.querySelector("source").src);
    	if (videoURL.hostname == location.hostname)
    		video.dataset.videoPoster = videoURL.pathname + "-poster.jpg";
    	if (video.dataset.videoPoster > "") {
			lazyLoadObserver(() => {
				video.poster = video.dataset.videoPoster;
			}, video, {
				root: scrollContainerOf(video),
				rootMargin: "100%"
			});
		}
    });
}, "eventListeners");

/******************************************************************************/
/*  Enable clicking anywhere on a video (that has not yet loaded and started to
    play) to load it and start playing it. (Otherwise, only clicking the ‘play’
    button causes the video to load and play.)
 */
addContentInjectHandler(GW.contentInjectHandlers.enableVideoClickToPlay = (eventInfo) => {
    GWLog("enableVideoClickToPlay", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("video").forEach(video => {
        video.addEventListener("click", video.clickToPlayEvent = (event) => {
            video.play();
            video.removeEventListener("click", video.clickToPlayEvent);
            video.clickToPlayEvent = null;
        });
    });
}, "eventListeners");

/****************************************************************/
/*  Account for interaction between image-focus.js and popups.js.
 */
if (Extracts.popFrameProvider == Popups) {
    GW.notificationCenter.addHandlerForEvent("ImageFocus.imageOverlayDidAppear", (info) => {
        Popups.hidePopupContainer();
    });
    GW.notificationCenter.addHandlerForEvent("ImageFocus.imageOverlayDidDisappear", (info) => {
        Popups.unhidePopupContainer();
    });
    GW.notificationCenter.addHandlerForEvent("ImageFocus.imageDidFocus", (info) => {
        /*  Pin a popup when clicking to image-focus an image within it
            (unless it’s a popup that contains *only* the image, and nothing
             else - no metadata, no other content, nothing - in which case,
             pinning is unnecessary).
         */
        let popup = Popups.containingPopFrame(info.image);
        if (   popup
            && (   popup.classList.contains("object")
                && Annotations.isAnnotatedLink(popup.spawningTarget) == false) == false)
            Popups.pinPopup(popup);
    });
}


/***************/
/* CODE BLOCKS */
/***************/

/*************************************************************/
/*  Wrap each <pre> in a div.sourceCode (for layout purposes).
 */
addContentLoadHandler(GW.contentLoadHandlers.wrapPreBlocks = (eventInfo) => {
    GWLog("wrapPreBlocks", "rewrite.js", 1);

    wrapAll("pre", ".sourceCode", {
        useExistingWrapper: true,
        root: eventInfo.container
    });
}, "rewrite");

/********************************************************/
/*  EXPERIMENTAL: Highlight-on-hover for all code blocks.
 */
addContentLoadHandler(GW.contentLoadHandlers.addCodeBlockLineClasses = (eventInfo) => {
    GWLog("addCodeBlockLineClasses", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("code.sourceCode > span:not(.line)").forEach(lineSpan => {
        lineSpan.classList.add("line");
        if (lineSpan.innerHTML.length == 0)
            lineSpan.innerHTML = "&nbsp;";
    });

    eventInfo.container.querySelectorAll("pre code:not(.sourceCode)").forEach(codeBlock => {
        codeBlock.innerHTML = codeBlock.innerHTML.split("\n").map(
            line => `<span class="line">${(line || "&nbsp;")}</span>`
        ).join("\n");
    });
}, "rewrite");

/*****************************************************************************/
/*  Allow for specifying code block classes by setting classes on the <pre>.
    (Workaround for a Pandoc peculiarity where classes set on a code block
     are applied to the <pre> element and not on the div.sourceCode wrapper.)
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyCodeBlockClasses = (eventInfo) => {
    GWLog("rectifyCodeBlockClasses", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("pre").forEach(preBlock => {
        let wrapper = preBlock.closest("div.sourceCode");

        //  Tag the wrapper with the <pre>’s classes.
        [ "float-left", "float-right" ].forEach(preClass => {
            if (preBlock.classList.contains(preClass)) {
                wrapper.classList.add(preClass);
                preBlock.classList.remove(preClass);
            }
        });

        preBlock.classList.remove("float");
    });
}, "rewrite");

/**********************************************************************/
/*  Wrap each pre.width-full in a div.width-full (for layout purposes).
 */
addContentInjectHandler(GW.contentInjectHandlers.wrapFullWidthPreBlocks = (eventInfo) => {
    GWLog("wrapFullWidthPreBlocks", "rewrite.js", 1);

    wrapAll("pre.width-full", ".width-full", {
        useExistingWrapper: true,
        root: eventInfo.container
    });
}, "rewrite", (info) => info.fullWidthPossible);


/**********/
/* EMBEDS */
/**********/

/******************************************************************************/
/*  There’s no way to tell whether an <iframe> has loaded, except to listen for
    the `load` event. So, we implement our own checkable load flag, with a
    class.
 */
addContentInjectHandler(GW.contentInjectHandlers.markLoadedEmbeds = (eventInfo) => {
    GWLog("markLoadedEmbeds", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("iframe.loaded-not").forEach(embed => {
        embed.addEventListener("load", (event) => {
            embed.classList.remove("loaded-not");
        }, { once: true });
    });
}, "eventListeners");

/**************************************************************************/
/*  Workaround for a Chrome bug that scrolls the parent page when an iframe
    popup has a `src` attribute with a hash and that hash points to an
    old-style anchor (`<a name="foo">`).
 */
addContentInjectHandler(GW.contentInjectHandlers.applyIframeScrollFix = (eventInfo) => {
    GWLog("applyIframeScrollFix", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("iframe.loaded-not").forEach(iframe => {
        let srcURL = URLFromString(iframe.src);
        if (   srcURL.pathname.endsWith(".html")
            && srcURL.hash > "") {
            srcURL.savedHash = srcURL.hash;
            srcURL.hash = "";
            iframe.src = srcURL.href;
        }

        iframe.addEventListener("load", (event) => {
            if (srcURL.savedHash) {
                let selector = selectorFromHash(srcURL.savedHash);
                let element = iframe.contentDocument.querySelector(`${selector}, [name='${(selector.slice(1))}']`);
                if (element)
                    iframe.contentWindow.scrollTo(0, element.getBoundingClientRect().y);
            }
        }, { once: true });
    });
}, "eventListeners");


/************/
/* HEADINGS */
/************/

/**********************************************************************/
/*	On main page, inject into section headings buttons that copy to the 
	clipboard the link to that section.
 */
addContentInjectHandler(GW.contentInjectHandlers.injectCopySectionLinkButtons = (eventInfo) => {
    GWLog("injectCopySectionLinkButtons", "rewrite.js", 1);

	let sectionHeadingSelector = _π("section", " > ", [ "h1", "h2", "h3", "h4", "h5", "h6" ], ":first-child").join(", ");

	eventInfo.container.querySelectorAll(sectionHeadingSelector).forEach(heading => {
		if (heading.querySelector(".copy-section-link-button") != null)
			return;

		let button = heading.appendChild(newElement("BUTTON", {
			type: "button",
			class: "copy-section-link-button",
			title: "Copy section link to clipboard",
			tabindex: "-1"
		}, {
			innerHTML: GW.svg("link-simple-solid")	
		}));

		button.addEventListener("mouseup", (event) => {
			button.classList.add("clicked");
		});
		button.addActivateEvent((event) => {
			copyTextToClipboard(heading.querySelector("a").href);

			if (button.clickTimer)
				clearTimeout(button.clickTimer);

			button.clickTimer = setTimeout(() => {
				button.classList.remove("clicked");
			}, 150);
		});
	});
}, ">rewrite", (info) => (info.container == document.main));


/***********/
/* COLUMNS */
/***********/

/*****************************************/
/*  Disable columns if only one list item.
 */
addContentLoadHandler(GW.contentLoadHandlers.disableSingleItemColumnBlocks = (eventInfo) => {
    GWLog("disableSingleItemColumnBlocks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".columns > ul").forEach(columnList => {
        if (columnList.children.length == 1) {
            columnList.parentElement.classList.remove("columns");

            if (columnList.parentElement.className == "")
                unwrap(columnList.parentElement);
        }
    });
}, "rewrite");


/**************/
/* INTERVIEWS */
/**************/

/****************************************/
/*  Rectify HTML structure of interviews.
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteInterviews = (eventInfo) => {
    GWLog("rewriteInterviews", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".interview, .interview > .collapse").forEach(interviewWrapper => {
        if (interviewWrapper.firstElementChild.tagName != "UL")
            return;

        let interview = newElement("UL", { class: `list ${interviewWrapper.className}` });

        for (let child of Array.from(interviewWrapper.children)) {
            if (child.tagName != "UL")
                continue;

            let exchange = interview.appendChild(newElement("LI", { class: "exchange" }));
            exchange.append(child.cloneNode(true));

            for (let utterance of exchange.firstElementChild.children) {
                utterance.classList.add("utterance");

                let speaker = utterance.querySelector("strong");

                //  If the speaker is wrapped, find the outermost wrapper.
                while (   speaker.parentElement
                       && speaker.parentElement.tagName != "P"
                       && speaker.nextSibling?.textContent.startsWith(":") != true)
                    speaker = speaker.parentElement;
                speaker.classList.add("speaker");

                //  Move colon.
                (speaker.querySelector("strong") ?? speaker).innerHTML += ": ";
                speaker.nextSibling.textContent = speaker.nextSibling.textContent.slice(1).trimStart();
            }
        }

        interviewWrapper.replaceWith(interview);
    });
}, "rewrite");


/****************/
/* MARGIN NOTES */
/****************/

/*************************************************************/
/*  Wrap the contents of all margin notes in an inner wrapper.
 */
addContentLoadHandler(GW.contentLoadHandlers.wrapMarginNotes = (eventInfo) => {
    GWLog("wrapMarginNotes", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".marginnote").forEach(marginnote => {
        let innerWrapper = newElement("SPAN", { "class": "marginnote-inner-wrapper" });
        innerWrapper.append(...marginnote.childNodes);
        marginnote.append(innerWrapper);

		/*	Designate those margin notes which consist of just an icon (e.g. 
			manicule).
		 */
		if (innerWrapper.textContent.trim().length <= 1)
			marginnote.classList.add("only-icon");
    });
}, "rewrite");

/**************************/
/*  Aggregate margin notes.
 */
addContentLoadHandler(GW.contentLoadHandlers.aggregateMarginNotes = (eventInfo) => {
    GWLog("aggregateMarginNotes", "rewrite.js", 1);

    aggregateMarginNotesInDocument(eventInfo.document);
}, "rewrite");


/**************/
/* TYPOGRAPHY */
/**************/

/*******************************************************************************/
/*  Apply various typographic fixes (educate quotes, inject <wbr> elements after
    certain problematic characters, etc.) in content transforms.

    Requires typography.js to be loaded prior to this file.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyTypographyInContentTransforms = (eventInfo) => {
    GWLog("rectifyTypographyInContentTransforms", "rewrite.js", 1);

    Typography.processElement(eventInfo.container,
        (  Typography.replacementTypes.QUOTES
         | Typography.replacementTypes.WORDBREAKS
         | Typography.replacementTypes.ELLIPSES));

    //  Educate quotes in image alt-text.
    eventInfo.container.querySelectorAll("img").forEach(image => {
        image.alt = Typography.processString(image.alt, Typography.replacementTypes.QUOTES);
    });
}, "rewrite", (info) => (   info.contentType == "wikipediaEntry"
                         || info.contentType == "tweet"));

/***********************************/
/*  Rectify typography in body text.

    NOTE: This should be temporary. Word breaks after slashes should be added
    in body text on the back end, at content build time. But that is currently
    not working, hence this temporary client-side solution.
    —SA 2023-09-13
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyTypographyInBodyText = (eventInfo) => {
    GWLog("rectifyTypographyInBodyText", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("p").forEach(graf => {
        Typography.processElement(graf, Typography.replacementTypes.WORDBREAKS);
    });
}, "rewrite");

/******************************************************************************/
/*  Remove extraneous whitespace-only text nodes from between the element parts
    of a .cite (citation element).
 */
addContentLoadHandler(GW.contentLoadHandlers.removeExtraneousWhitespaceFromCitations = (eventInfo) => {
    GWLog("removeExtraneousWhitespaceFromCitations", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".cite").forEach(citation => {
        Array.from(citation.children).forEach(citationPart => {
            if (   citationPart.nextSibling
                && citationPart.nextSibling.nodeType == Node.TEXT_NODE
                && isNodeEmpty(citationPart.nextSibling))
                citationPart.nextSibling.remove();
        });
    });
}, "rewrite");

/**********************************************************/
/*	Convert Unicode “icon” glyphs into proper inline icons.
 */
addContentLoadHandler(GW.contentLoadHandlers.iconifyUnicodeIconGlyphs = (eventInfo) => {
    GWLog("iconifyUnicodeIconGlyphs", "rewrite.js", 1);

	let glyphIconMapping = {
		"☞": "icon-manicule-right"  // U+261E WHITE RIGHT POINTING INDEX
	};

	let processElement = (element) => {
		let replacements = [ ];
		let replacedGlyphs = [ ];

		for (let node of element.childNodes) {
			if (node.nodeType === Node.ELEMENT_NODE) {
				let replacedGlyphsInNode = processElement(node);

				if (   replacedGlyphsInNode.length > 0
					&& node.classList.containsAnyOf(replacedGlyphsInNode.map(g => glyphIconMapping[g])))
					replacements.push([ node, node.childNodes ]);

				replacedGlyphs.push(...replacedGlyphsInNode);
			} else if (node.nodeType === Node.TEXT_NODE) {
				let glyphRegExp = new RegExp(Object.keys(glyphIconMapping).join("|"), "g");
				let parts = [ ];
				let start = 0;
				let match = null;
				while (match = glyphRegExp.exec(node.textContent)) {
					replacedGlyphs.push(match[0]);
					parts.push([ match[0], start, match.index ]);
					start = match.index + match[0].length;
				}
				if (parts.length > 0) {
					let replacementNodes = [ ];
					parts.forEach(part => {
						if (part[1] > part[0])
							replacementNodes.push(document.createTextNode(node.textContent.slice(...(part.slice(1,2)))));
						replacementNodes.push(newElement("SPAN", { "class": glyphIconMapping[part[0]] }));
					});
					if (node.textContent.length > start)
						replacementNodes.push(document.createTextNode(node.textContent.slice(start)));
					replacements.push([ node, replacementNodes ]);
				}
			}
		}

		if (replacements.length > 0) {
			//	Replace.
			replacements.forEach(replacement => {
				let [ replacedNode, replacementNodes ] = replacement;
				replacedNode.parentNode.replaceChild(newDocument(replacementNodes), replacedNode);
			});
		}

		return replacedGlyphs;
	}

    eventInfo.container.querySelectorAll("p").forEach(graf => {
    	processElement(graf);
    });
}, "rewrite");

/******************************************************/
/*	Inject full fraction markup into .fraction <span>s.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyFractionMarkup = (eventInfo) => {
    GWLog("rectifyFractionMarkup", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("span.fraction").forEach(fraction => {
		fraction.innerHTML = fraction.innerHTML.replace(/^(.+?)\u2044(.+?)$/, (match, num, denom) => {
			return `<span class="num">${num}</span><span class="frasl">&#x2044;</span><span class="denom">${denom}</span>`;
		});
	});
}, "rewrite");

/******************************************************************/
/*  Configure Hyphenopoly.

    Requires Hyphenopoly_Loader.js to be loaded prior to this file.
 */
Hyphenopoly.config({
    require: {
        "en-us": "FORCEHYPHENOPOLY"
    },
    setup: {
        hide: "none",
        keepAlive: true,
        safeCopy: false
    }
});

/**********************************************/
/*  Hyphenate with Hyphenopoly.

    Requires Hyphenopoly_Loader.js to be loaded prior to this file.
 */
addContentInjectHandler(GW.contentInjectHandlers.hyphenate = (eventInfo) => {
    GWLog("hyphenate", "rewrite.js", 1);

    if (Hyphenopoly.hyphenators == null)
        return;

    if (GW.isX11())
        return;

    let selector = (GW.isMobile()
                    ? ".markdownBody p"
                    : (eventInfo.document == document
                       ? ".sidenote p, .abstract blockquote p"
                       : "p"));
    let blocks = eventInfo.container.querySelectorAll(selector);
    Hyphenopoly.hyphenators.HTML.then((hyphenate) => {
        blocks.forEach(block => {
            hyphenate(block);
            Typography.processElement(block, Typography.replacementTypes.NONE, true);
        });
    });
}, "rewrite");

/************************************************************************/
/*  Remove soft hyphens and other extraneous characters from copied text.
 */
addCopyProcessor((event, selection) => {
    Typography.processElement(selection, Typography.replacementTypes.CLEAN);

    return true;
});

/*****************************************************************************/
/*  Makes it so that copying an author-date citation (e.g. `Foo et al 2001`)
    interact properly with copy-paste when rendered with pseudo-element ellipses
    (`Foo...2001`).
 */
addCopyProcessor((event, selection) => {
    /*  Set `display` of all `span.cite-joiner` to `initial` (overriding the
        default of `none`) so that their contents are included in the
        content properties of the selection); inject surrounding spaces.
     */
    selection.querySelectorAll(".cite-joiner").forEach(citeJoiner => {
        citeJoiner.style.display = "initial";
        citeJoiner.innerHTML = ` ${citeJoiner.innerHTML} `;
    });

    /*  Inject preceding space when a span.cite-date follows immediately after
        a span.cite-author (i.e., there is no span.cite-joiner, because there
        are no more than two authors).
     */
    selection.querySelectorAll(".cite-author + .cite-date").forEach(citeDateAfterAuthor => {
        citeDateAfterAuthor.innerHTML = ` ${citeDateAfterAuthor.innerHTML}`;
    });

    return true;
});

/****************************************************************************/
/*  Normalize symbols (e.g. U+2731 HEAVY ASTERISK ‘✱’ => normal asterisk ‘*’)
 */
addCopyProcessor((event, selection) => {
    Typography.processElement(selection, Typography.replacementTypes.SYMBOLS);

    return true;
});


/*********************/
/* FULL-WIDTH BLOCKS */
/*********************/

/*******************************************************************************/
/*  Expands all tables (& other blocks) whose wrapper block is marked with class
    ‘width-full’, and all figures marked with class ‘width-full’, to span the
    viewport (minus a specified margin on both sides).
 */
function createFullWidthBlockLayoutStyles() {
    GWLog("createFullWidthBlockLayoutStyles", "rewrite.js", 1);

    /*  Configuration and dynamic value storage.
     */
    GW.fullWidthBlockLayout = {
        sideMargin: 25,
        pageWidth: 0,
        leftAdjustment: 0
    };

    /*  Pre-query key elements, to save performance on resize.
     */
    let rootElement = document.querySelector("html");
    let markdownBody = document.querySelector("#markdownBody");

    /*  Inject styles block to hold dynamically updated layout variables.
     */
    let fullWidthBlockLayoutStyles = document.querySelector("head").appendChild(newElement("STYLE", { id: "full-width-block-layout-styles" }));

    /*  Function to update layout variables (called immediately and on resize).
     */
    let updateFullWidthBlockLayoutStyles = (event) => {
        GWLog("updateFullWidthBlockLayoutStyles", "rewrite.js", 2);

        GW.fullWidthBlockLayout.pageWidth = rootElement.offsetWidth;

        let markdownBodyRect = markdownBody.getBoundingClientRect();
        let markdownBodyRightMargin = GW.fullWidthBlockLayout.pageWidth - markdownBodyRect.right;
        GW.fullWidthBlockLayout.leftAdjustment = markdownBodyRect.left - markdownBodyRightMargin;

        fullWidthBlockLayoutStyles.innerHTML = `:root {
            --GW-full-width-block-layout-side-margin: ${GW.fullWidthBlockLayout.sideMargin}px;
            --GW-full-width-block-layout-page-width: ${GW.fullWidthBlockLayout.pageWidth}px;
            --GW-full-width-block-layout-left-adjustment: ${GW.fullWidthBlockLayout.leftAdjustment}px;
        }`;
    };
    updateFullWidthBlockLayoutStyles();

    //  Add listener to update layout variables on window resize.
    addWindowResizeListener(updateFullWidthBlockLayoutStyles, {
        name: "updateFullWidthBlockLayoutStylesOnWindowResizeListener"
    });
}

doWhenPageLoaded(createFullWidthBlockLayoutStyles);

/************************************/
/*  Set margins of full-width blocks.
 */
addContentInjectHandler(GW.contentInjectHandlers.setMarginsOnFullWidthBlocks = (eventInfo) => {
    GWLog("setMarginsOnFullWidthBlocks", "rewrite.js", 1);

    //  Get all full-width blocks in the given document.
    let allFullWidthBlocks = eventInfo.container.querySelectorAll("div.width-full, figure.width-full");

    let removeFullWidthBlockMargins = () => {
        allFullWidthBlocks.forEach(fullWidthBlock => {
            fullWidthBlock.style.marginLeft = "";
            fullWidthBlock.style.marginRight = "";
        });
    };

    if (eventInfo.fullWidthPossible == false) {
        removeFullWidthBlockMargins();
        return;
    }

    //  Un-expand when mobile width, expand otherwise.
    doWhenMatchMedia(GW.mediaQueries.mobileWidth, "updateFullWidthBlockExpansionForCurrentWidthClass", () => {
        removeFullWidthBlockMargins();
    }, () => {
        allFullWidthBlocks.forEach(fullWidthBlock => {
            //  Compensate for block indentation due to nesting (e.g., lists).
            let additionalLeftAdjustmentPx = "0px";
            let enclosingListItem = fullWidthBlock.closest("li");
            if (enclosingListItem) {
                let fullContentRect = fullWidthBlock.closest(".markdownBody").getBoundingClientRect();
                let listContentRect = enclosingListItem.firstElementChild.getBoundingClientRect();
                additionalLeftAdjustmentPx = (fullContentRect.x - listContentRect.x) + "px";
            }

            fullWidthBlock.style.marginLeft = `calc(
                                                    (-1 * (var(--GW-full-width-block-layout-left-adjustment) / 2.0))
                                                  + (var(--GW-full-width-block-layout-side-margin))
                                                  - ((var(--GW-full-width-block-layout-page-width) - 100%) / 2.0)
                                                  + (${additionalLeftAdjustmentPx} / 2.0)
                                                )`;
            fullWidthBlock.style.marginRight = `calc(
                                                     (var(--GW-full-width-block-layout-left-adjustment) / 2.0)
                                                   + (var(--GW-full-width-block-layout-side-margin))
                                                   - ((var(--GW-full-width-block-layout-page-width) - 100%) / 2.0)
                                                   - (${additionalLeftAdjustmentPx} / 2.0)
                                                )`;
        });
    });
}, ">rewrite");


/***************/
/* ANNOTATIONS */
/***************/

/******************************************************************************/
/*  Transform title-link of truncated annotations (i.e., full annotations
    transcluded as partial annotations) to allow access to the full annotation.
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteTruncatedAnnotations = (eventInfo) => {
    GWLog("rewriteTruncatedAnnotations", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".annotation-partial").forEach(partialAnnotation => {
        //  Check to see whether the abstract exists.
        if (Annotations.referenceDataForLink(eventInfo.includeLink).content.abstract == null)
            return;

        //  Rewrite title-link.
        partialAnnotation.querySelector("a.title-link").classList.add(Annotations.annotatedLinkFullClass);
    });
}, "<rewrite", (info) => (   info.source == "transclude"
                          && info.contentType == "annotation"));

/**********************************************************/
/*	Strip quotes from title-links in annotation pop-frames.
 */
addContentInjectHandler(GW.contentInjectHandlers.rewriteAnnotationTitleLinksInPopFrames = (eventInfo) => {
    GWLog("rewriteAnnotationTitleLinksInPopFrames", "rewrite.js", 1);

	eventInfo.container.querySelector(".data-field.title .title-link")?.trimQuotes();
}, "rewrite", (info) => (   info.source == "transclude"
						 && info.contentType == "annotation"
						 && info.context == "popFrame"));

/***************************************************************************/
/*  Apply proper classes to inline file-include collapses, both on directory
    index pages and in annotations.
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifyFileAppendClasses = (eventInfo) => {
    GWLog("rectifyFileAppendClasses", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".aux-links-transclude-file, .file-includes").forEach(fileIncludesBlock => {
        //  The file-include block itself may be a collapse! If so, wrap it.
        if (fileIncludesBlock.matches(".collapse"))
            fileIncludesBlock = wrapElement(fileIncludesBlock, "div.file-includes", { moveClasses: [ "data-field", "file-includes" ] });
        //  Rectify class.
        fileIncludesBlock.swapClasses([ "aux-links-transclude-file", "file-includes" ], 1);
        //  Apply standard class to all collapses within the includes block.
        fileIncludesBlock.querySelectorAll(".collapse").forEach(fileIncludeCollapse => {
            fileIncludeCollapse.swapClasses([ "aux-links-transclude-file", "file-include-collapse" ], 1);
            fileIncludeCollapse.swapClasses([ "bare-content", "bare-content-not" ], 1);
        });
    });
}, "rewrite");

/******************************************************************************/
/*  Properly handle file includes in annotations when their include-link fires.
 */
addContentInjectHandler(GW.contentInjectHandlers.handleFileIncludeUncollapseInAnnotations = (eventInfo) => {
    GWLog("handleFileIncludeUncollapseInAnnotations", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".file-include-collapse").forEach(fileIncludeCollapse => {
        let includeLink = fileIncludeCollapse.querySelector("a");
        GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (embedInjectEventInfo) => {
            /*  Don’t scroll to an embed in the main document if there are
                popups on screen.
             */
            if (   embedInjectEventInfo.document == document
                && Extracts.popFrameProvider == Popups
                && Popups.allSpawnedPopups().length > 0)
                return;

            let embed = embedInjectEventInfo.container.firstElementChild;

            //  Scroll into view (but not if it’s off-screen).
            if (isOnScreen(embed))
                scrollElementIntoView(embed);
            if (   embed.tagName == "IFRAME"
                && Extracts.popFrameProvider.containingPopFrame(embed) != null)
                embed.addEventListener("load", (event) => {
                    if (isOnScreen(embed))
                        scrollElementIntoView(embed);
                }, { once: true });

            //  Designate now-last collapse for styling.
            let previousBlock = previousBlockOf(embed);
            if (   embed.closest(".collapse") == null
                && previousBlock?.classList.contains("collapse-block"))
                previousBlock.classList.add("last-collapse");
        }, {
            once: true,
            condition: (info) => (info.includeLink == includeLink)
        });
    });
}, "eventListeners", (info) => (info.contentType == "annotation"));

/***************************************************************************/
/*  Because annotations transclude aux-links, we make the aux-links links in
    the metadata line of annotations scroll down to the appended aux-links
    blocks.
 */
addContentInjectHandler(GW.contentInjectHandlers.rewriteAuxLinksLinksInTranscludedAnnotations = (eventInfo) => {
    GWLog("rewriteAuxLinksLinksInTranscludedAnnotations", "rewrite.js", 1);

    let annotation = eventInfo.container.querySelector(".annotation");
    if (annotation == null)
        return;

    let inPopFrame = (Extracts.popFrameProvider.containingPopFrame(annotation) != null);

    annotation.querySelectorAll(".data-field.aux-links a.aux-links").forEach(auxLinksLink => {
        let auxLinksLinkType = AuxLinks.auxLinksLinkType(auxLinksLink);
        let includedAuxLinksBlock = annotation.querySelector(`.${auxLinksLinkType}-append`);
        if (includedAuxLinksBlock) {
            auxLinksLink.onclick = () => { return false; };
            auxLinksLink.addActivateEvent((event) => {
                if (includedAuxLinksBlock.querySelector("ul, ol") == null) {
                    GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (info) => {
                        revealElement(includedAuxLinksBlock);
                    }, { once: true });
                }

                revealElement(includedAuxLinksBlock);

                return false;
            });
        }
    });
}, "eventListeners", (info) => (info.contentType == "annotation"));

/******************************************************************************/
/*  Bind mouse hover events to, when hovering over an annotated link, highlight
    that annotation (as viewed in a tags directory, for instance).
 */
addContentInjectHandler(GW.contentInjectHandlers.bindSectionHighlightEventsToAnnotatedLinks = (eventInfo) => {
    GWLog("bindSectionHighlightEventsToAnnotatedLinks", "rewrite.js", 1);

    Annotations.allAnnotatedLinksInContainer(eventInfo.container).forEach(annotatedLink => {
        //  Unbind existing events, if any.
        if (annotatedLink.annotatedLinkMouseEnter)
            annotatedLink.removeEventListener("mouseenter", annotatedLink.annotatedLinkMouseEnter);
        if (annotatedLink.annotatedLinkMouseLeave)
            annotatedLink.removeEventListener("mouseleave", annotatedLink.annotatedLinkMouseLeave);

        //  Bind events.
        let escapedLinkURL = CSS.escape(decodeURIComponent(annotatedLink.href));
        let targetAnalogueInLinkBibliography = document.querySelector(`a[id^='link-bibliography'][href='${escapedLinkURL}']`);
        if (   targetAnalogueInLinkBibliography
            && targetAnalogueInLinkBibliography != annotatedLink) {
            let containingSection = targetAnalogueInLinkBibliography.closest("section");
            if (containingSection) {
                annotatedLink.addEventListener("mouseenter", annotatedLink.annotatedLinkMouseEnter = (event) => {
                    clearTimeout(containingSection.highlightFadeTimer);
                    containingSection.classList.toggle("highlight-fading", false);
                    containingSection.classList.toggle("highlighted", true);
                });
                annotatedLink.addEventListener("mouseleave", annotatedLink.annotatedLinkMouseLeave = (event) => {
                    containingSection.classList.toggle("highlight-fading", true);
                    containingSection.highlightFadeTimer = setTimeout(() => {
                        containingSection.classList.toggle("highlight-fading", false);
                        containingSection.classList.toggle("highlighted", false);
                    }, 150);
                });
            }
        }
    });
}, "eventListeners");


/*********************/
/* DIRECTORY INDEXES */
/*********************/

/******************************************************************************/
/*  On directory index pages, remove invalid include-links in file-append
    sections; if no valid includes remain, delete the entire file-append block.
 */
addContentLoadHandler(GW.contentLoadHandlers.stripInvalidFileAppends = (eventInfo) => {
    GWLog("stripInvalidFileAppends", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".aux-links-transclude-file").forEach(fileAppendBlock => {
        /*  Remove any file embed links that lack a valid content type (e.g.,
            foreign-site links that have not been whitelisted for embedding; or
            a PDF embed, on a mobile client, which is considered invalid because
            mobile browsers do not support PDF embedding).
         */
        Transclude.allIncludeLinksInContainer(fileAppendBlock).forEach(includeLink => {
            if (Content.contentTypeForLink(includeLink) == null)
                includeLink.remove();
        });

        //  If no valid include-links remain, delete the whole block.
        if (isNodeEmpty(fileAppendBlock)) {
            //  Delete colon.
            if (fileAppendBlock.previousElementSibling.lastTextNode.nodeValue == ":")
                fileAppendBlock.previousElementSibling.lastTextNode.remove();

            fileAppendBlock.remove();
        }
    });
}, "rewrite", (info) => (   info.container == document.main
                         && /\/(index)?$/.test(location.pathname)));


/*********************/
/* LINK BIBLIOGRAPHY */
/*********************/

/*****************************************************************************/
/*  Apply a class to those link-bibs that should use the more compact styling.
 */
addContentInjectHandler(GW.contentInjectHandlers.applyLinkBibliographyCompactStylingClass = (eventInfo) => {
    GWLog("applyLinkBibliographyCompactStylingClass", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".link-bibliography-list").forEach(linkBibList => {
        if (linkBibList.closest("li, .link-bibliography-append, .popframe-body.link-bibliography"))
            linkBibList.classList.add("link-bibliography-list-compact");
    });
}, "rewrite");

/****************************************************/
/*	Adjust layout of link bibliography context links.
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifyLinkBibliographyContextLinks = (eventInfo) => {
    GWLog("rectifyLinkBibliographyContextLinks", "rewrite.js", 1);

	eventInfo.container.querySelectorAll(".link-bibliography-context").forEach(link => {
		//	Inject context links into annotations, once those load.
		let linkBibEntryIncludeLink = link.closest("li").querySelector("a:not(.link-bibliography-context)");
		if (Transclude.isAnnotationTransclude(linkBibEntryIncludeLink)) {
			GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", (info) => {
				let annotationTitleLine = info.container.querySelector(".data-field.title");
				annotationTitleLine.insertBefore(document.createTextNode(" "), annotationTitleLine.firstChild);
				annotationTitleLine.insertBefore(link, annotationTitleLine.firstChild);
			}, {
				condition: (info) => (info.includeLink == linkBibEntryIncludeLink),
				once: true
			});
		}
	});
}, "<rewrite", (info) => (   info.source == "transclude"
						  && info.loadLocation?.pathname.startsWith("/metadata/annotation/link-bibliography/")));


/*********************/
/* TABLE OF CONTENTS */
/*********************/

/******************************************************************/
/*  Sets TOC collapse state and updates the collapse toggle button.
 */
function setTOCCollapseState(collapsed = false) {
    let TOC = document.querySelector("#TOC");
    if (TOC == null)
        return;

    TOC.classList.toggle("collapsed", collapsed);

    let button = TOC.querySelector(".toc-collapse-toggle-button");
    if (button == null)
        return;

    button.title = collapsed ? "Expand table of contents" : "Collapse table of contents";
}

/*******************************************************/
/*  Add the collapse toggle button to the main page TOC.
 */
addContentLoadHandler(GW.contentLoadHandlers.injectTOCCollapseToggleButton = (eventInfo) => {
    GWLog("injectTOCCollapseToggleButton", "rewrite.js", 1);

    let TOC = document.querySelector("#TOC");
    if (TOC == null)
        return;

    let button = newElement("BUTTON", {
        "class": "toc-collapse-toggle-button",
        "title": "Collapse table of contents",
        "tabindex": "-1"
    }, {
        "innerHTML": `<span>${(GW.svg("chevron-left-solid"))}</span>`
    });
    TOC.appendChild(button);

    let defaultTOCCollapseState = "false";
    setTOCCollapseState((localStorage.getItem("toc-collapsed") ?? defaultTOCCollapseState) == "true");

    button.addActivateEvent((event) => {
        setTOCCollapseState(TOC.classList.contains("collapsed") == false);
        localStorage.setItem("toc-collapsed", TOC.classList.contains("collapsed"));
    });
}, "rewrite", (info) => (info.container == document.main));

/***************************************************************************/
/*  Strip spurious <span> tags (unavoidably added by Pandoc) from TOC links
    (only in the page-level TOC).
 */
addContentLoadHandler(GW.contentLoadHandlers.stripTOCLinkSpans = (eventInfo) => {
    GWLog("stripTOCLinkSpans", "rewrite.js", 1);

    unwrapAll(".TOC li a > span:not([class])", {
        root: eventInfo.container
    });
}, "rewrite", (info) => (info.container == document.main));

/**************************************************************************/
/*  Update main page TOC with any sections within the initially loaded page
    that don’t already have TOC entries.
 */
addContentLoadHandler(GW.contentLoadHandlers.updateMainPageTOC = (eventInfo) => {
    GWLog("updateMainPageTOC", "rewrite.js", 1);

    updatePageTOC();
}, "rewrite", (info) => (info.container == document.main));

/*************************************************/
/*  Apply typography rectification to TOC entries.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyTypographyInTOC = (eventInfo) => {
    GWLog("rectifyTypographyInTOC", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".TOC").forEach(TOC => {
        Typography.processElement(TOC, Typography.replacementTypes.WORDBREAKS);
    });
}, "rewrite");

/**********************************************************/
/*  Disable link decoration (underlining) on all TOC links.
 */
addContentLoadHandler(GW.contentLoadHandlers.disableTOCLinkDecoration = (eventInfo) => {
    GWLog("disableTOCLinkDecoration", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".TOC a").forEach(link => {
        link.classList.add("decorate-not");
    });
}, "rewrite");

/**********************************************************/
/*  Relocate and clean up TOC on tag directory index pages.
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteDirectoryIndexTOC = (eventInfo) => {
    GWLog("rewriteDirectoryIndexTOC", "rewrite.js", 1);

    let TOC = document.querySelector("#TOC");
    let seeAlsoSection = document.querySelector("#see-also");

    if (   TOC == null
        || seeAlsoSection == null)
        return;

    /*  Place the TOC after the “See Also” section (which also places it after
        the page abstract, if such exists, because that comes before the
        “See Also” section).
     */
    seeAlsoSection.parentElement.insertBefore(TOC, seeAlsoSection.nextElementSibling);

    //  The “See Also” section no longer needs a TOC entry.
    TOC.querySelector("#toc-see-also").closest("li").remove();

    /*  If “Links” is the only remaining section, then it does not itself need
        a TOC entry; shift its children up one TOC level.
     */
    let linksTOCEntry = TOC.querySelector("#toc-links");
    if (   linksTOCEntry
        && isOnlyChild(linksTOCEntry.closest("li"))) {
        let outerTOCList = TOC.querySelector("ul");
        let innerTOCList = TOC.querySelector("#toc-links + ul");

        TOC.insertBefore(innerTOCList, null);
        outerTOCList.remove();

        //  Mark with special class, for styling purposes.
        TOC.classList.add("TOC-links-only");
    }

    //  Update visibility.
    updateTOCVisibility(TOC);
}, "rewrite", (info) => (   info.container == document.main
                         && /\/(index)?$/.test(location.pathname)));

/***************************************************************************/
/*  Add recently-modified link icons in page TOC, to indicate recently added
	page sections.
 */
addContentLoadHandler(GW.contentLoadHandlers.addRecentlyModifiedDecorationsToPageTOC = (eventInfo) => {
    GWLog("addRecentlyModifiedDecorationsToPageTOC", "rewrite.js", 1);

	let excludedPaths = [
		"/blog/",
		"/ref/"
	];
	if (location.pathname.startsWithAnyOf(excludedPaths))
		return;

	let TOC = document.querySelector("#TOC");
	if (TOC == null)
		return;

	/*	Create document fragment with synthetic include-link for annotation
		of the current page.
	 */
    let annotationDoc = newDocument(synthesizeIncludeLink(location.pathname, { class: "link-annotated include-annotation" }));
	let annotationIncludeLink = annotationDoc.firstElementChild;

	//	Trigger include-link.
	Transclude.triggerTransclude(annotationIncludeLink, {
		source: "addRecentlyModifiedDecorationsToPageTOC",
		container: annotationDoc,
		document: annotationDoc
	}, {
		doWhenDidInject: (info) => {
			/*	Copy `link-modified-recently` class from entries in annotation 
				TOC to corresponding entries in main page TOC.
			 */
			annotationDoc.querySelectorAll(".TOC .link-modified-recently").forEach(recentlyModifiedTOCLink => {
				TOC.querySelector("#" + CSS.escape(recentlyModifiedTOCLink.id)).classList.add("link-modified-recently");
			});
			GW.contentInjectHandlers.enableRecentlyModifiedLinkIcons({ container: TOC });
		}
	});
}, "rewrite", (info) => (info.container == document.main));

/************************************************************************/
/*  If the table of contents has but one entry (or none at all), hide it.
 */
addContentLoadHandler(GW.contentLoadHandlers.updateTOCVisibility = (eventInfo) => {
    GWLog("updateTOCVisibility", "rewrite.js", 1);

    let TOC = eventInfo.container.querySelector(".TOC");
    if (TOC == null)
        return;

    updateTOCVisibility(TOC);
}, "rewrite");


/*************/
/* FOOTNOTES */
/*************/

/*****************************************************/
/*  Inject self-link for the footnotes section itself.
 */
addContentLoadHandler(GW.contentLoadHandlers.injectFootnoteSectionSelfLink = (eventInfo) => {
    GWLog("injectFootnoteSectionSelfLink", "rewrite.js", 1);

    let footnotesSection = eventInfo.container.querySelector("#footnotes");
    if (footnotesSection == null)
        return;

    let footnotesSectionSelfLink = newElement("A", {
        "class": "section-self-link graf-content-not",
        "href": "#footnotes",
        "title": "Link to section: § ‘Footnotes’"
    });

    footnotesSection.insertBefore(footnotesSectionSelfLink, footnotesSection.firstElementChild.nextElementSibling);

    //  Highlight on hover.
    footnotesSectionSelfLink.addEventListener("mouseenter", (event) => {
        footnotesSectionSelfLink.previousElementSibling.classList.toggle("highlighted", true);
    });
    footnotesSectionSelfLink.addEventListener("mouseleave", (event) => {
        footnotesSectionSelfLink.previousElementSibling.classList.toggle("highlighted", false);
    });
}, "rewrite");

/*****************************************/
/*  Add footnote class to footnote blocks.
 */
addContentLoadHandler(GW.contentLoadHandlers.addFootnoteClassToFootnotes = (eventInfo) => {
    GWLog("addFootnoteClassToFootnotes", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("#footnotes > ol > li").forEach(footnote => {
        footnote.classList.add("footnote");
    });
}, "rewrite");

/*****************************************************************************/
/*  Mark hash-targeted footnote with ‘targeted’ class on page load, and update
    when hash changes.
 */
addContentInjectHandler(GW.contentInjectHandlers.markTargetedFootnote = (eventInfo) => {
    GWLog("markTargetedFootnote", "rewrite.js", 1);

    //  Mark target footnote, if any.
    updateFootnoteTargeting();

    //  Add event handler to update targeting again on hash change.
    GW.notificationCenter.addHandlerForEvent("GW.hashDidChange", (info) => {
        updateFootnoteTargeting();
    });
}, "rewrite", (info) => info.container == document.main);

/******************************/
/*  Inject footnote self-links.
 */
addContentLoadHandler(GW.contentLoadHandlers.injectFootnoteSelfLinks = (eventInfo) => {
    GWLog("injectFootnoteSelfLinks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("#footnotes > ol > li").forEach(footnote => {
        if (footnote.querySelector(".footnote-self-link"))
            return;

        let footnoteNumber = Notes.noteNumber(footnote);
        footnote.insertBefore(newElement("A", {
            href: `#fn${footnoteNumber}`,
            title: `Link to footnote ${footnoteNumber}`,
            class: "footnote-self-link graf-content-not"
        }, {
            innerHTML: "&nbsp;"
        }), footnote.firstChild);
    });
}, "rewrite");

/*****************************************************************/
/*  Rewrite footnote back-to-citation links (generated by Pandoc).
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteFootnoteBackLinks = (eventInfo) => {
    GWLog("rewriteFootnoteBackLinks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("#footnotes > ol > li").forEach(footnote => {
        let backlink = footnote.querySelector(".footnote-back");

        if (backlink.querySelector("svg, .placeholder"))
            return;

        backlink.innerHTML = GW.svg("arrow-hook-left");
    });
}, "rewrite");

/***************************************************************************/
/*  Bind mouse hover events to, when hovering over a citation, highlight all
    {side|foot}notes associated with that citation.
 */
addContentInjectHandler(GW.contentInjectHandlers.bindNoteHighlightEventsToCitations = (eventInfo) => {
    GWLog("bindNoteHighlightEventsToCitations", "rewrite.js", 1);

    let allCitations = eventInfo.container.querySelectorAll(".footnote-ref");

    let bindEventsToCitation = (citation) => {
        //  Unbind existing events, if any.
        if (citation.citationMouseEnter)
            citation.removeEventListener("mouseenter", citation.citationMouseEnter);
        if (citation.citationMouseLeave)
            citation.removeEventListener("mouseleave", citation.citationMouseLeave);

        //  Bind events.
        let notesForCitation = Notes.allNotesForCitation(citation);
        citation.addEventListener("mouseenter", citation.citationMouseEnter = (event) => {
            notesForCitation.forEach(note => {
                note.classList.toggle("highlighted", true);
            });
        });
        citation.addEventListener("mouseleave", citation.citationMouseLeave = (event) => {
            notesForCitation.forEach(note => {
                note.classList.toggle("highlighted", false);
            });
        });
    };

    //  Bind events.
    allCitations.forEach(bindEventsToCitation);

    if (allCitations.length > 0) {
        //  Add handler to re-bind events if more notes are injected.
        addContentInjectHandler(GW.contentInjectHandlers.rebindNoteHighlightEventsToCitations = (eventInfo) => {
            allCitations.forEach(bindEventsToCitation);
        }, "eventListeners", (info) => (   info.document == document
                                        || info.document == eventInfo.document));
    }
}, "eventListeners");

/******************************************/
/*  Highlight footnote self-links on hover.
 */
addContentInjectHandler(GW.contentInjectHandlers.bindHighlightEventsToFootnoteSelfLinks = (eventInfo) => {
    GWLog("bindHighlightEventsToFootnoteSelfLinks", "rewrite.js", 1);

    //  Highlight footnote on hover over self-link.
    eventInfo.container.querySelectorAll(".footnote-self-link").forEach(footnoteSelfLink => {
        footnoteSelfLink.addEventListener("mouseenter", (event) => {
            footnoteSelfLink.parentElement.classList.toggle("highlighted", true);
        });
        footnoteSelfLink.addEventListener("mouseleave", (event) => {
            footnoteSelfLink.parentElement.classList.toggle("highlighted", false);
        });
    });
}, "eventListeners");


/*********/
/* LINKS */
/*********/

/****************************************************************************/
/*  For links with a `data-url-original` attribute, save the `href` attribute
    value in `data-url-archive`, set the `href` to the value of
    `data-url-original`, and delete `data-url-original`.
 */
addContentLoadHandler(GW.contentLoadHandlers.reverseArchivedLinkPolarity = (eventInfo) => {
    GWLog("reverseArchivedLinkPolarity", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("a[data-url-original]").forEach(archivedLink => {
        archivedLink.dataset.urlArchive = archivedLink.href;
        archivedLink.href = archivedLink.dataset.urlOriginal;
        delete archivedLink.dataset.urlOriginal;
    });
}, "<transclude");

/**********************************************************************/
/*  Qualify anchorlinks in loaded content by rewriting their `pathname`
    attributes.
 */
addContentInjectHandler(GW.contentInjectHandlers.qualifyAnchorLinks = (eventInfo) => {
    GWLog("qualifyAnchorLinks", "rewrite.js", 1);

    let baseLocation = baseLocationForDocument(eventInfo.document);
    if (baseLocation == null)
        return;

    let injectingIntoFullPage = (eventInfo.document.querySelector(".markdownBody > #page-metadata, #page-metadata.markdownBody") != null);

    eventInfo.container.querySelectorAll("a[href]").forEach(link => {
        if (   eventInfo.localize == true
            && (   link.getAttribute("href").startsWith("#")
                || link.pathname == eventInfo.loadLocation.pathname)
                   // if the link refers to an element also in the loaded content
            && (   eventInfo.container.querySelector(selectorFromHash(link.hash)) != null
                   //  if the link refers to the loaded content container itself
                || (   eventInfo.container instanceof Element
                    && eventInfo.container.matches(selectorFromHash(link.hash)))
                   //  if we’re injecting into a full page (base page or pop-frame)
                || (   injectingIntoFullPage
                           //  if we’re transcluding a citation (because we merge footnotes)
                    && (   (   eventInfo.source == "transclude"
                            && link.classList.contains("footnote-ref"))
                           //  if we’re merging a footnote for transcluded content
                        || (   eventInfo.source == "transclude.footnotes"
                            && link.classList.contains("footnote-back"))
                        )
                    )
                )
            ) {
            link.pathname = baseLocation.pathname;
        } else if (   eventInfo.loadLocation != null
        		   && link.getAttribute("href").startsWith("#")) {
			link.pathname = eventInfo.loadLocation.pathname;
        }
    });
}, "<rewrite");

/********************************************************************/
/*  Designate self-links (a.k.a. anchorlinks) and local links (a.k.a.
    within-site links) as such, via CSS classes.
 */
addContentInjectHandler(GW.contentInjectHandlers.addSpecialLinkClasses = (eventInfo) => {
    GWLog("addSpecialLinkClasses", "rewrite.js", 1);

    let baseLocation = baseLocationForDocument(eventInfo.document);
    if (baseLocation == null)
        return;

    let exclusionSelector = [
        "h1, h2, h3, h4, h5, h6",
        ".section-self-link",
        ".footnote-ref",
        ".footnote-back",
        ".footnote-self-link",
        ".sidenote-self-link",
        ".backlink-context"
    ].join(", ");

    eventInfo.container.querySelectorAll(".markdownBody a[href]").forEach(link => {
        if (   link.hostname != location.hostname
            || link.closest(exclusionSelector))
            return;

        if (link.pathname == baseLocation.pathname) {
        	link.swapClasses([ "link-self", "link-page" ], 0);
        } else if (link.pathname.slice(1).match(/[\.]/) == null) {
            link.swapClasses([ "link-self", "link-page" ], 1);
        }
    });
}, "<rewrite");

/****************************************/
/*	Add IDs to un-ID’d within-page links.
 */
addContentInjectHandler(GW.contentInjectHandlers.identifyAnchorLinks = (eventInfo) => {
    GWLog("identifyAnchorLinks", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("a.link-self").forEach(link => {
		if (link.id == "")
			link.id = "gwern-" + (link.href + link.textContent).hashCode();
	});
}, "<rewrite");

/******************************************************************************/
/*  Assign local navigation link icons: directional in-page links, generic
	(non-directional) self-links, and local page links. (These should be
	applied only within body text, including pop-frames but excluding page
	metadata sections; and should not be applied to links that already have a
	special link icon, e.g. one assigned on the back-end; nor to links that are
	specifically marked as needing no icon at all.)
 */
addContentInjectHandler(GW.contentInjectHandlers.designateLocalNavigationLinkIcons = (eventInfo) => {
    GWLog("designateLocalNavigationLinkIcons", "rewrite.js", 1);

	/*	Do not display special link icons in these containers and for these
		elements.
	 */
	let exclusionSelector = [
		".icon-not",
		".icon-special",
		"#sidebar",
		"#page-metadata",
		"#footer",
		".aux-links"
	].join(", ");

    //  Self-links (anchorlinks to the current page).
    eventInfo.container.querySelectorAll(".link-self").forEach(link => {
		if (link.closest(exclusionSelector))
			return;

        link.dataset.linkIconType = "text";
        link.dataset.linkIcon = link.hash > ""
        						? "\u{00B6}"   // ‘¶’ PILCROW SIGN
        						: "\u{1D50A}"; // ‘𝔊’ MATHEMATICAL FRAKTUR CAPITAL G [gwern.net logo]

        /*  Directional navigation links on self-links: for each self-link like
            “see [later](#later-identifier)”, find the linked identifier,
            whether it's before or after, and if it is before/previously,
            annotate the self-link with ‘↑’ (UPWARDS ARROW) and if after/later,
            ‘↓’ (DOWNWARDS ARROW).

            This helps the reader know if it’s a backwards link to an identifier
            already read, or an unread identifier, enabling a mental map and
            reducing the cognitive overhead of constantly choosing whether to
            follow a reference.

            This was implemented statically pre-transclusion as an optimization,
            but given that dynamism forces runtime checking of relative status
            for all new fragments (popups or transclude), that has been removed
            in favor of this JS hook, to simplify code & ensure a single source
            of truth.
         */
        let target = eventInfo.document.querySelector(selectorFromHash(link.hash));
        if (target == null)
        	return;

        link.dataset.linkIconType = "svg";
        link.dataset.linkIcon =
            (link.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING
             ? "arrow-down"
             : "arrow-up");
    });

    //  Local links (to other pages on the site).
    eventInfo.container.querySelectorAll(".link-page").forEach(link => {
		if (link.closest(exclusionSelector))
			return;

        if (   link.dataset.linkIcon
        	&& [ "arrow-down", "arrow-up" ].includes(link.dataset.linkIcon) == false)
            return;

        link.dataset.linkIconType = "text";
        link.dataset.linkIcon = [ "arrow-down", "arrow-up" ].includes(link.dataset.linkIcon)
                                ? "\u{00B6}"   // ‘¶’
                                : "\u{1D50A}"; // ‘𝔊’
    });
}, "rewrite");

/*****************************************/
/*  Removes link icons that should not be.
 */
addContentInjectHandler(GW.contentInjectHandlers.cleanSpuriousLinkIcons = (eventInfo) => {
    GWLog("cleanSpuriousLinkIcons", "rewrite.js", 1);

    let excludedLinkSelector = [
        /*  Index page, and embeds thereof, do not need the G icon.

            NOTE: we do not use the usual method of suppressing G icons
            (`.icon-not` class), because /index and /404 are *so* long
            and routinely modified/expanded, so doing it ‘manually’ would risk
            occasional omissions or syntax errors.
         */
        "body.page-index #markdownBody",
        "body.page-404 #markdownBody",
        ".popframe-body.page-index",
        ".popframe-body.page-404",

        //  TOC links should never have link icons under any circumstances.
        ".TOC",

        //  No link icons in table headers.
        "thead"
    ].map(x => x + " a[data-link-icon]").join(", ");

    eventInfo.container.querySelectorAll(excludedLinkSelector).forEach(link => {
        link.removeAttribute("data-link-icon-type");
        link.removeAttribute("data-link-icon");
    });
}, "rewrite");

/****************************************************************************/
/*  Adds HTML and CSS to a link, enabling display of its specified link icon.
 */
function enableLinkIcon(link) {
    if (link.classList.contains("has-icon"))
        return;

    //  Add hook.
    link.appendChild(newElement("SPAN", { class: "link-icon-hook dark-mode-invert" }, { innerHTML: "\u{2060}" }));

    //  Set CSS variable (link icon).
    if (link.dataset.linkIconType.includes("text")) {
		let linkIcon = link.dataset.linkIcon;

		//	Inject newline into quad link icons.
		if (link.dataset.linkIconType.includes("quad"))
			linkIcon = linkIcon.slice(0, 2) + "\\a " + linkIcon.slice(2);

        link.style.setProperty("--link-icon", `"${linkIcon}"`);
    } else if (link.dataset.linkIconType.includes("svg")) {
        let iconFileURL = versionedAssetURL("/static/img/icon/icons.svg");
        link.style.setProperty("--link-icon-url",
            `url("${iconFileURL.pathname}${iconFileURL.search}#${(link.dataset.linkIcon)}")`);
    }

    //  Set class.
    link.classList.add("has-icon");
}

/*****************************************************************************/
/*  Disables display of a link’s link icon by removing requisite HTML and CSS.
 */
function disableLinkIcon(link) {
    if (link.classList.contains("has-icon") == false)
        return;

    //  Remove hook.
    link.querySelector(".link-icon-hook").remove();

    //  Clear CSS variables.
    link.style.removeProperty("--link-icon");
    link.style.removeProperty("--link-icon-url");

    //  Unset class.
    link.classList.remove("has-icon");
}

/*************************************************************************/
/*  Enable or disable display of link icons, as appropriate for each link.
 */
addContentInjectHandler(GW.contentInjectHandlers.setLinkIconStates = (eventInfo) => {
    GWLog("setLinkIconStates", "rewrite.js", 1);

	//	Disable display of all link icons.
	eventInfo.container.querySelectorAll("a.has-icon").forEach(link => {
		disableLinkIcon(link);
	});

    //  Enable display of link icons for all links that have specified icons.
    eventInfo.container.querySelectorAll("a[data-link-icon]").forEach(link => {
		if (link.dataset.linkIcon > "")
	        enableLinkIcon(link);
    });
}, "rewrite");

/***************************************************************************/
/*  Adds HTML and CSS to a link, enabling colorization of the link icon (and
	the link underlining) on hover. (Requires color.js to be loaded.)
 */
function enableLinkIconColor(link) {
	if (   link.dataset.linkIconColor == null
		|| link.dataset.linkIconColor == "")
		return;

	/*	The transformation colorizes a base color (the text color) to match a
		reference color (the specified link icon color), while maintaining
		relative perceptual lightness.
	 */
	let transformColor = (colorCode) => {
		return Color.processColorValue(colorCode, [ {
			type: Color.ColorTransform.COLORIZE,
			referenceColor: link.dataset.linkIconColor
		} ]);
	};

	//	Set CSS variable (link icon hover color).
	link.style.setProperty("--link-icon-color-hover", transformColor("#000"));

	/*	If the link has an SVG link icon, colorize the SVG, and set the colored
		icon (via a data URI) as the link icon to display on hover.
	 */
	if (link.dataset.linkIconType?.includes("svg")) {
		doWhenSVGIconsLoaded(() => {
			let svg = elementFromHTML(GW.svg(link.dataset.linkIcon).replace(/(?<!href=)"(#[0-9A-Fa-f]+)"/g, 
				(match, colorCode) => {
					return `"${(transformColor(colorCode))}"`;
				}));
			svg.setAttribute("fill", transformColor("#000"));
			link.style.setProperty("--link-icon-url-hover", `url("data:image/svg+xml;utf8,${encodeURIComponent(svg.outerHTML)}")`);
		});
	}
}

/******************************************/
/*	Disables hover colorization for a link.
 */
function disableLinkIconColor(link) {
	link.style.removeProperty("--link-icon-color-hover");
	link.style.removeProperty("--link-icon-url-hover");
}

/*********************************************************************/
/*	Enable link hover colorization, for those links which have a color 
	specified via the data-link-icon-color attribute.
 */
addContentInjectHandler(GW.contentInjectHandlers.setLinkHoverColors = (eventInfo) => {
    GWLog("setLinkIconStates", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("a[data-link-icon-color]").forEach(enableLinkIconColor);
}, "rewrite");

/**********************************************************************/
/*	Adds recently-modified icon (white star on black circle) to a link.
 */
function addRecentlyModifiedIconToLink(link) {
	if (link.classList.contains("has-recently-modified-icon") == true)
		return;

	//  Inject indicator hook span.
	link.insertBefore(newElement("SPAN", { class: "recently-modified-icon-hook" }), link.firstChild);

	if (link.classList.contains("has-indicator-hook")) {
		/*	If the link has an indicator hook, we must inject a text node 
			containing a U+2060 WORD JOINER between the two hooks. This ensures 
			that the two link styling elements are arranged properly, and do not 
			span a line break.
		 */
		 link.insertBefore(document.createTextNode("\u{2060}"), link.querySelector(".indicator-hook"));
	} else {
		/*  Inject U+2060 WORD JOINER at start of first text node of the
			link. (It _must_ be injected as a Unicode character into the
			existing text node; injecting it within the .indicator-hook
			span, or as an HTML escape code into the text node, or in
			any other fashion, creates a separate text node, which
			causes all sorts of problems - text shadow artifacts, etc.)
		 */
		let linkFirstTextNode = link.firstTextNode;
		if (   linkFirstTextNode
			&& linkFirstTextNode.textContent.startsWith("\u{2060}") == false)
			linkFirstTextNode.textContent = "\u{2060}" + linkFirstTextNode.textContent;
	}

	link.classList.add("has-recently-modified-icon");
}

/***************************************************************************/
/*	Removes recently-modified icon (white star on black circle) from a link.
 */
function removeRecentlyModifiedIconFromLink(link) {
	if (link.classList.contains("has-recently-modified-icon") == false)
		return;

	let iconHook = link.querySelector(".recently-modified-icon-hook");
	if (iconHook.nextSibling.firstTextNode.textContent.startsWith("\u{2060}"))
		iconHook.nextSibling.firstTextNode.textContent = iconHook.nextSibling.firstTextNode.textContent.slice(1);
	iconHook.remove();

	link.classList.remove("has-recently-modified-icon");

	/*	If this link has an indicator hook, then we must remove the text node 
		containing U+2060 WORD JOINER between the two hooks.
	 */
	if (   link.classList.contains("has-indicator-hook")
		&& link.firstTextNode.textContent == "\u{2060}")
		link.firstTextNode.remove();
}

/****************************************************************************/
/*  Enable special icons for recently modified links (that are not in lists).
 */
addContentInjectHandler(GW.contentInjectHandlers.enableRecentlyModifiedLinkIcons = (eventInfo) => {
    GWLog("enableRecentlyModifiedLinkIcons", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("a.link-modified-recently:not(.in-list)").forEach(addRecentlyModifiedIconToLink);
}, "rewrite");


/***************/
/* DATE RANGES */
/***************/

/****************************************************************************/
/*  Makes it so that copying a date range interacts properly with copy-paste.
 */
addCopyProcessor((event, selection) => {
    stripDateRangeMetadataInBlock(selection);

    return true;
});


/************************/
/* INFLATION ADJUSTMENT */
/************************/

GW.currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});
GW.currentYear = new Date().getFullYear();

/*************************************************************************/
/*  Return prettified version of a string representing an amount of money.
 */
function prettifyCurrencyString(amount, compact = false, forceRound = false) {
    let currency = amount[0];

    let number = Number(amount.replace(/[^0-9.−-]+/g, ""));
    if (   number >= 100
        || forceRound)
        number = Math.round(number);

    amount = GW.currencyFormatter.format(number);

    //  Remove trailing zeroes.
    amount = amount.replace(/\.00?$/, '');

    //  Reset currency unit.
    amount = currency + amount.slice(1);

    if (compact) {
        amount = amount.replace(/,000,000,000$/, 'b');
        amount = amount.replace(/,000,000$/, 'm');
        amount = amount.replace(/,000$/, 'k');
    }

    return amount;
}

/**************************************************************************/
/*  Rewrite inflation-adjustment elements to make the currency amounts more
    useful and readable.
 */
addContentLoadHandler(GW.contentLoadHandlers.rewriteInflationAdjusters = (eventInfo) => {
    GWLog("rewriteInflationAdjusters", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".inflation-adjusted").forEach(infAdj => {
        let unadjusted = infAdj.querySelector("sup");
        let adjusted = infAdj.firstChild;

        unadjusted.textContent = prettifyCurrencyString(unadjusted.textContent, true);

        /*  Always round adjusted amount if unadjusted amount has no fractional
            component and adjusted amount has more than one whole digit.
         */
        let forceRound = (   unadjusted.textContent.includes(".") == false
                          && adjusted.textContent.match(/([0-9]+)(\.|$)/)[1].length > 1);
        adjusted.textContent = prettifyCurrencyString(adjusted.textContent, false, forceRound);
    });
}, "rewrite");

/***************************************************************************/
/*  Makes it so that copying an inflation-adjusted currency amount interacts
    properly with copy-paste.
 */
addCopyProcessor((event, selection) => {
    /*  Rewrite inflation-adjuster elements into a simple inline typographical
        format, e.g. “$0.10 (1990; $1.30 in 2023)”.
     */
    selection.querySelectorAll(".inflation-adjusted").forEach(infAdj => {
        let adjustedText = infAdj.firstChild.textContent;
        let unadjustedText = infAdj.querySelector("sup").textContent;
        let yearText = infAdj.querySelector("sub").textContent;

        //  Un-abbreviate powers of 1,000 in unadjusted amount.
        unadjustedText = unadjustedText.replace("k", ",000");
        unadjustedText = unadjustedText.replace("m", ",000,000");
        unadjustedText = unadjustedText.replace("b", ",000,000,000");

        infAdj.innerHTML = `${unadjustedText} [${yearText}; ${adjustedText} in ${GW.currentYear}]`;
    });

    return true;
});

/******************************************************************************/
/*  Makes double-clicking on an inflation adjuster select the entire element.
    (This is so that the copy processor, above, can reliably work as intended.)
 */
addContentInjectHandler(GW.contentInjectHandlers.addDoubleClickListenersToInflationAdjusters = (eventInfo) => {
    GWLog("addDoubleClickListenersToInflationAdjusters", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".inflation-adjusted").forEach(infAdj => {
        infAdj.addEventListener("dblclick", (event) => {
            document.getSelection().selectNode(infAdj);
        });
    });
}, "eventListeners");


/*********/
/* MISC. */
/*********/

/******************************************************************************/
/*	Resolve random element selectors (i.e., containers with a class like
	“display-random-one”) by uniform-randomly selecting the requisite number of
	child elements and making them visible.
 */
addContentInjectHandler(GW.contentInjectHandlers.resolveRandomElementSelectors = (eventInfo) => {
    GWLog("resolveRandomElementSelectors", "rewrite.js", 1);

	let wordsToNumbersMapping = {
		"one":    1,
		"two":    2,
		"three":  3,
		"four":   4,
		"five":   5,
		"six":    6,
		"seven":  7,
		"eight":  8,
		"nine":   9,
		"ten":   10,
	};

	eventInfo.container.querySelectorAll("[class*='display-random-']:not(.visible)").forEach(randomSelectorContainer => {
		//	Determine how many elements to display.
		let howMany = Array.from(randomSelectorContainer.classList).find(cssClass => /^display-random-/.test(cssClass))?.slice("display-random-".length);
		howMany = wordsToNumbersMapping[howMany];

		/*	Select elements to display, until as many as needed are displayed,
			or else none remain to display.
		 */
		let childElements = Array.from(randomSelectorContainer.children);
		while (   howMany > 0
			   && childElements.length > 0) {
			let selectedChildElement = childElements[rollDie(childElements.length) - 1];
			selectedChildElement.classList.add("visible");
			childElements.remove(selectedChildElement);
			howMany--;
		}

		//	Make the container visible.
		randomSelectorContainer.classList.add("visible");
	});
}, "rewrite");

/*********************************************************/
/*	Regenerate placeholder IDs. (See misc.js for details.)
 */
addContentInjectHandler(GW.contentInjectHandlers.regeneratePlaceholderIds = (eventInfo) => {
    GWLog("removeNoscriptTags", "rewrite.js", 1);

	regeneratePlaceholderIds(eventInfo.container);
}, "rewrite");

/*****************************************************************************/
/*	For obvious reasons, <noscript> tags are completely useless in any content
	loaded by this code, and they sometimes interfere with stuff.
 */
addContentLoadHandler(GW.contentLoadHandlers.removeNoscriptTags = (eventInfo) => {
    GWLog("removeNoscriptTags", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("noscript").forEach(noscript => {
		noscript.remove();
	});
}, "<rewrite");

GW.defaultImageAuxText = "[Image]";

/***************************************************************************/
/*  Clean up image alt-text. (Shouldn’t matter, because all image URLs work,
    right? Yeah, right...)
 */
addContentLoadHandler(GW.contentLoadHandlers.cleanUpImageAltText = (eventInfo) => {
    GWLog("cleanUpImageAltText", "rewrite.js", 1);

    /*  If an image has no alt text, use the value of the ‘title’ attribute,
        if present; otherwise, a default string (“Image”).
     */
    eventInfo.container.querySelectorAll("img:not([alt])").forEach(image => {
        image.alt = (image.title || GW.defaultImageAuxText);
    });

    //  URL-encode ‘%’ signs in image alt text.
    eventInfo.container.querySelectorAll("img[alt]").forEach(image => {
        image.alt = decodeURIComponent(image.alt.replace(/%(?![A-Fa-f0-9]{2})/g, "%25"));
    });
}, "rewrite");

/************************************************************************/
/*  Prevent line breaks immediately before citations (which “orphans” the
    citation on the next line, and looks ugly) and immediately after citations
    (which causes punctuation following a citation to be orphaned, and also
    looks ugly).
 */
addContentLoadHandler(GW.contentLoadHandlers.noBreakForCitations = (eventInfo) => {
    GWLog("noBreakForCitations", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".footnote-ref").forEach(citation => {
        citation.parentElement.insertBefore(document.createTextNode("\u{2060}"), citation);
        let textNode = citation.querySelector("sup").firstTextNode;
        textNode.textContent = "\u{2060}" + textNode.textContent + "\u{2060}";
    });
}, "rewrite");

/****************************************************************************/
/*  Designate containers wherein colors (e.g. link colors) should be inverted
    (because the container has a dark background).
 */
addContentLoadHandler(GW.contentLoadHandlers.designateColorInvertedContainers = (eventInfo) => {
    GWLog("designateColorInvertedContainers", "rewrite.js", 1);

    let selector = [
        ".admonition.warning",
        ".admonition.error"
    ].join(", ");

    eventInfo.container.querySelectorAll(selector).forEach(container => {
        container.classList.add("colors-invert");
    });
}, "rewrite");

/******************************************************************/
/*  Wrap text nodes and inline elements in admonitions in <p> tags.
 */
addContentLoadHandler(GW.contentLoadHandlers.paragraphizeAdmonitionTextNodes = (eventInfo) => {
    GWLog("paragraphizeAdmonitionTextNodes", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".admonition", ".admonition-title").forEach(paragraphizeTextNodesOfElementRetainingMetadata);
}, "rewrite");

/*********************************************/
/*  Fix incorrect text block tag types.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifySpecialTextBlockTagTypes = (eventInfo) => {
    GWLog("rectifySpecialTextBlockTagTypes", "rewrite.js", 1);

	//	Classes which are on <div> but should be on <p>.
	let problematicBlockSelector = [
		"text-center",
		"smallcaps"
	].map(className => `div.${className}`).join(", ");

    eventInfo.container.querySelectorAll(problematicBlockSelector).forEach(div => {
        unwrap(div, {
        	moveID: true,
        	moveClasses: true
        });
    });
}, "rewrite");

/*******************************************************/
/*  Designate ordinal superscripts (1st, 2nd, 3rd, nth).
 */
addContentLoadHandler(GW.contentLoadHandlers.designateOrdinals = (eventInfo) => {
    GWLog("designateOrdinals", "rewrite.js", 1);

    eventInfo.container.querySelectorAll("sup").forEach(sup => {
        if ([ "st", "nd", "rd", "th" ].includes(sup.textContent.toLowerCase()))
            sup.classList.add("ordinal");
    });
}, "rewrite");

/**********************************************************/
/*	Inject progress indicator icons into any element with a 
	data-progress-percentage attribute.
 */
addContentLoadHandler(GW.contentLoadHandlers.injectProgressIcons = (eventInfo) => {
    GWLog("injectProgressIcons", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("[data-progress-percentage]").forEach(renderProgressPercentageIcon);
}, "rewrite");

/*********************************************************************/
/*	Fix a minor appearance glitch in some fields in the page metadata.
 */
addContentLoadHandler(GW.contentLoadHandlers.rectifyPageMetadataFieldLinkAppearance = (eventInfo) => {
    GWLog("rectifyPageMetadataFieldLinkAppearance", "rewrite.js", 1);

	eventInfo.container.querySelectorAll("#page-metadata a").forEach(pageMetadataLink => {
		let nextNode = pageMetadataLink.nextSibling;
		if (   nextNode?.nodeType == Node.TEXT_NODE
			&& nextNode?.nodeValue.startsWith(":")) {
			nextNode.remove();
			pageMetadataLink.parentElement.insertBefore(newElement("SPAN", null, { innerHTML: nextNode.nodeValue }), pageMetadataLink.nextSibling);
		}
	});
}, "rewrite");

/***************************************************************************/
/*	Make blocks that are next to the TOC clear the TOC if they are too long.
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifyTOCAdjacentBlockLayout = (eventInfo) => {
    GWLog("rectifyTOCAdjacentBlockLayout", "rewrite.js", 1);

	let markdownBody = document.querySelector("#markdownBody");
	let TOC = document.querySelector("#TOC");

	GW.layout.TOCAdjacentBlockLayoutNeedsRectification = false;

	let rectifyTOCAdjacentBlockLayoutIfNeeded = () => {
		if (GW.layout.TOCAdjacentBlockLayoutNeedsRectification == false)
			return;

		GW.layout.TOCAdjacentBlockLayoutNeedsRectification = false;

		let TOCRect = TOC.getBoundingClientRect();

		let blockOptions = {
			notBlockElements: [ "section" ],
			alsoWrapperElements: [ "section" ]
		};
		let block = firstBlockOf(markdownBody, blockOptions, true);
		while (block = nextBlockOf(block, blockOptions)) {
			if (   block.classList.contains("collapse")
				&& (   isCollapsed(block) == false
					|| block.style.clear > ""))
				continue;

			block.style.removeProperty("clear");
			block.closest("section")?.style.removeProperty("clear");

			let blockRect = block.getBoundingClientRect();
			if (   blockRect.top <= TOCRect.bottom
				&& blockRect.bottom - TOCRect.bottom > window.innerHeight * 0.5) {
				if (previousBlockOf(block) == null) {
					block.closest("section").style.clear = "left";
				} else {
					block.style.clear = "left";
				}

				TOC.style.marginBottom = "2.5rem";
			} else if (   blockRect.top > TOCRect.bottom
					   && block.style.clear == ""
					   && (block.closest("section")?.style.clear > "") == false) {
				break;
			}
		}
	};

	GW.notificationCenter.addHandlerForEvent("Layout.layoutProcessorDidComplete", (layoutEventInfo) => {
		GW.layout.TOCAdjacentBlockLayoutNeedsRectification = true;

		requestAnimationFrame(rectifyTOCAdjacentBlockLayoutIfNeeded);
	}, {
		condition: (layoutEventInfo) => (   layoutEventInfo.container == document.main
										 && layoutEventInfo.processorName == "applyBlockSpacingInContainer")
	});
}, "rewrite", (info) => info.container == document.main);

/****************************************************************************/
/*	Remove from copied content anything that is hidden on the current type of
	client (i.e., via the .mobile-not or .desktop-not classes).
 */
addCopyProcessor((event, selection) => {
	selection.querySelectorAll(GW.isMobile() ? ".mobile-not" : ".desktop-not").forEach(element => { element.remove(); });

	return true;
});

/****************************************************************************/
/*	Ensure that inline mode selectors have reasonable textual representations
	in copied content.
 */
addCopyProcessor((event, selection) => {
	selection.querySelectorAll(".mode-selector-inline button, .link-widget a").forEach(button => {
		let label = button.dataset.name ?? button.getAttribute("aria-label") ?? (button.getAttribute("title") || button.getAttribute("href"))
		if (button.classList.contains("selected"))
			label = label.toUpperCase();
		button.replaceWith(document.createTextNode("[" + label + "]"));
	});

	return true;
});


/************/
/* DROPCAPS */
/************/

/***************************************************/
/*  Dropcaps (only on sufficiently wide viewports).
 */
addContentInjectHandler(GW.contentInjectHandlers.rewriteDropcaps = (eventInfo) => {
    GWLog("rewriteDropcaps", "rewrite.js", 1);

    //  Reset dropcaps when margin note mode changes.
    doWhenMatchMedia(Sidenotes.mediaQueries.viewportWidthBreakpoint, "GW.dropcaps.resetDropcapsWhenMarginNoteModeChanges", (mediaQuery) => {
        eventInfo.container.querySelectorAll(GW.dropcaps.dropcapBlockSelector).forEach(resetDropcapInBlock);
    });

    //  A letter (capital or lowercase), optionally preceded by an opening quotation mark.
    let initialRegexp = new RegExp(/^(\s*[“‘]?)?([a-zA-Z])/);

    processContainerNowAndAfterBlockLayout(eventInfo.container, (container) => {
        container.querySelectorAll(GW.dropcaps.dropcapBlockSelector).forEach(dropcapBlock => {
            //  If this dropcap has already been processed, do nothing.
            if (dropcapBlock.querySelector(".dropcap"))
                return;

            //  Make sure the graf begins properly and determine initial letter.
            let initial = initialRegexp.exec(textContentOfGraf(dropcapBlock));
            if (initial == null) {
                addDropcapClassTo(dropcapBlock, "not");
                return;
            }
            let [ fullInitial, precedingPunctuation, initialLetter ] = initial;

            //  Locate insertion point.
            let firstNode = firstTextNodeOfGraf(dropcapBlock);
            let firstNodeParent = firstNode.parentElement;

            //  Separate first letter from rest of text content.
            firstNode.textContent = firstNode.textContent.slice(fullInitial.length);

            //  Determine dropcap type.
            let dropcapType = dropcapTypeOf(dropcapBlock);

            //  Is this is a graphical dropcap?
            if (GW.dropcaps.graphicalDropcapTypes.includes(dropcapType)) {
                //  Designate as graphical dropcap block.
                dropcapBlock.classList.add("graphical-dropcap");

                //  Inject a hidden span to hold the first letter as text.
                firstNodeParent.insertBefore(newElement("SPAN", {
                    class: "hidden-initial-letter",
                }, {
                    innerHTML: initialLetter
                }), firstNode);

                //  Construct the dropcap image element.
                let dropcapImage = newElement("IMG", {
                    class: "dropcap figure-not",
                    loading: "lazy"
                });

                //  Select a dropcap.
                let dropcapURL = getDropcapURL(dropcapType, initialLetter);
                if (dropcapURL == null) {
                    //  If no available dropcap image, set disabled flag.
                    dropcapBlock.classList.add("disable-dropcap");
                } else {
                    //  Specify image URL.
                    dropcapImage.src = dropcapURL.pathname + dropcapURL.search;

                    //  Add image file format class.
                    dropcapImage.classList.add(dropcapURL?.pathname.slice(-3));

                    /*  Dropcap should be inverted if it’s designed for a mode
                        opposite to the current mode (rather than being designed
                        either for the current mode or for either mode); in such a
                        case it will have the opposite mode in the file name.
                     */
                    let shouldInvert = dropcapURL.pathname.includes("-" + (DarkMode.computedMode() == "light" ? "dark" : "light"));
                    if (shouldInvert)
                        dropcapImage.classList.add("invert");
                }

                //  Inject the dropcap image element.
                firstNodeParent.insertBefore(dropcapImage, firstNode.previousSibling);
            } else {
                //  Inject the dropcap.
                firstNodeParent.insertBefore(newElement("SPAN", {
                    class: "dropcap"
                }, {
                    innerHTML: initialLetter.toUpperCase()
                }), firstNode);
            }

            //  If there’s punctuation before the initial letter, inject it.
            if (precedingPunctuation) {
                firstNodeParent.insertBefore(newElement("SPAN", {
                    class: "initial-preceding-punctuation"
                }, {
                    innerHTML: precedingPunctuation
                }), firstNodeParent.querySelector(".dropcap"));
            }
        });
    });
}, "rewrite", (info) => (   info.document == document
                         && GW.mediaQueries.mobileWidth.matches == false
                         && GW.isMobile() == false));

/***********************************************************/
/*  Activate mode-based dynamic graphical dropcap swapping.
 */
addContentInjectHandler(GW.contentInjectHandlers.activateDynamicGraphicalDropcaps = (eventInfo) => {
    GWLog("activateDynamicGraphicalDropcaps", "rewrite.js", 1);

    processContainerNowAndAfterBlockLayout(eventInfo.container, (container) => {
        container.querySelectorAll(GW.dropcaps.dropcapBlockSelector).forEach(dropcapBlock => {
            //  Determine dropcap type.
            let dropcapType = dropcapTypeOf(dropcapBlock);

            //  Is this a recognized graphical dropcap type?
            if (GW.dropcaps.graphicalDropcapTypes.includes(dropcapType) == false)
                return;

            //  Get the dropcap image element.
            let dropcapImage = dropcapBlock.querySelector("img.dropcap");
            if (dropcapImage == null)
                return;

            //  Get the initial letter.
            let initialLetter = dropcapBlock.querySelector(".hidden-initial-letter")?.textContent;
            if (initialLetter == null)
                return;

            //  If the handler already exists, do nothing.
            if (dropcapImage.modeChangeHandler)
                return;

            //  Add event handler to switch image when mode changes.
            GW.notificationCenter.addHandlerForEvent(dropcapImage.modeChangeHandler = "DarkMode.computedModeDidChange", (info) => {
                //  Clear disabled flag, if any.
                dropcapBlock.classList.remove("disable-dropcap");

                //  Get new dropcap URL.
                let dropcapURL = getDropcapURL(dropcapType, initialLetter);
                if (dropcapURL == null) {
                    //  If no available dropcap image, set disabled flag.
                    dropcapBlock.classList.add("disable-dropcap");
                    return;
                }

                //  Update image URL.
                dropcapImage.src = dropcapURL.pathname + dropcapURL.search;

                //  Update inversion.
                dropcapImage.classList.toggle("invert", dropcapURL.pathname.includes("-" + (DarkMode.computedMode() == "light" ? "dark" : "light")));

                //  Update image file format class.
                dropcapImage.classList.remove("png", "svg");
                dropcapImage.classList.add(dropcapURL.pathname.slice(-3));
            });
        });
    });
}, "eventListeners", (info) => (   info.document == document
                                && GW.mediaQueries.mobileWidth.matches == false
                                && GW.isMobile() == false));

/*********************/
/*  Linkify dropcaps.
 */
addContentInjectHandler(GW.contentInjectHandlers.linkifyDropcaps = (eventInfo) => {
    GWLog("linkifyDropcaps", "rewrite.js", 1);

    processContainerNowAndAfterBlockLayout(eventInfo.container, (container) => {
        container.querySelectorAll(GW.dropcaps.dropcapBlockSelector).forEach(dropcapBlock => {
            //  If this dropcap has already been linkified, do nothing.
            if (dropcapBlock.querySelector(".link-dropcap"))
                return;

            //  Determine dropcap type.
            let dropcapType = dropcapTypeOf(dropcapBlock);

            //  Determine initial letter.
            let initialLetter = (   dropcapBlock.querySelector("span.dropcap")
                                 ?? dropcapBlock.querySelector(".hidden-initial-letter")).textContent;

            //  Get the dropcap (textual or graphical).
            let dropcap = dropcapBlock.querySelector(".dropcap");

            //  Wrap the dropcap (textual or graphical) in a link.
            let dropcapLink = newElement("A", {
                class: "link-page link-dropcap",
                href: "/dropcap#" + dropcapType,
                "data-letter": initialLetter,
                "data-dropcap-type": dropcapType
            });
            let dropcapLinkWrapper = newElement("SPAN");
            dropcapLinkWrapper.append(dropcapLink);
            dropcapLink.append(dropcap);

            //  Locate insertion point.
            let firstNode = firstTextNodeOfGraf(dropcapBlock);
            let firstNodeParent = firstNode.parentElement;
            if (firstNodeParent.matches(".initial-preceding-punctuation")) {
                firstNode = firstNodeParent.nextSibling;
                firstNodeParent = firstNodeParent.parentElement;
            } else if (firstNodeParent.matches(".hidden-initial-letter")) {
                firstNode = firstNodeParent;
                firstNodeParent = firstNodeParent.parentElement;
            }

            //  Inject the link-wrapped dropcap back into the block.
            firstNodeParent.insertBefore(dropcapLinkWrapper, firstNode);

            //  Process the link to enable extract pop-frames.
            Extracts.addTargetsWithin(dropcapLinkWrapper);

            //  Unwrap temporary wrapper.
            unwrap(dropcapLinkWrapper);
        });
    });
}, "rewrite", (info) => (   info.document == document
                         && GW.mediaQueries.mobileWidth.matches == false
                         && GW.isMobile() == false));

/***********************************************************************/
/*  Prevent blocks with dropcaps from overlapping the block below them.
 */
addContentInjectHandler(GW.contentInjectHandlers.preventDropcapsOverlap = (eventInfo) => {
    GWLog("preventDropcapsOverlap", "rewrite.js", 1);

    let blocksNotToBeOverlappedSelector = [
        "p[class*='dropcap-']",
        "section",
        "blockquote",
        ".collapse",
        ".list-heading",
        ".in-list",
        "div.sourceCode"
    ].join(", ");

    processContainerNowAndAfterBlockLayout(eventInfo.container, (container) => {
        container.querySelectorAll("p[class*='dropcap-']:not(.dropcap-not)").forEach(dropcapBlock => {
            let nextBlock = nextBlockOf(dropcapBlock);
            if (   nextBlock == null
                || nextBlock.matches(blocksNotToBeOverlappedSelector))
                dropcapBlock.classList.add("overlap-not");
        });
    });
}, ">rewrite", (info) => (   info.document == document
                          && GW.mediaQueries.mobileWidth.matches == false
                          && GW.isMobile() == false));


/********/
/* MATH */
/********/

/**************************************/
/*  Unwrap <p> wrappers of math blocks.
 */
addContentLoadHandler(GW.contentLoadHandlers.unwrapMathBlocks = (eventInfo) => {
    GWLog("unwrapMathBlocks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".mjpage__block").forEach(mathBlock => {
        mathBlock = mathBlock.closest(".math");
        mathBlock.classList.add("block");

        if (   mathBlock.parentElement?.matches("p")
            && isOnlyChild(mathBlock))
            unwrap(mathBlock.parentElement);
    });
}, "rewrite");

/*****************************************************************************/
/*  Makes it so that copying a rendered equation or other math element copies
    the LaTeX source, instead of the useless gibberish that is the contents of
    the text nodes of the HTML representation of the equation.
 */
addCopyProcessor((event, selection) => {
    if (event.target.closest(".mjx-math")) {
        selection.replaceChildren(event.target.closest(".mjx-math").getAttribute("aria-label"));

        return false;
    }

    selection.querySelectorAll(".mjx-chtml").forEach(mathElement => {
        mathElement.innerHTML = " " + mathElement.querySelector(".mjx-math").getAttribute("aria-label") + " ";
    });

    return true;
});

/*****************************************************************************/
/*  Make copying text from Wikipedia articles with math elements properly copy
    the LaTeX source of the math fallback images, rather than omitting them.
 */
addCopyProcessor((event, selection) => {
    selection.querySelectorAll(".wikipedia-math-wrapper img").forEach(mathImage => {
        let mathText = mathImage.alt.slice(1, -1).replace("\\displaystyle", "");

        let mathWrapper = mathImage.closest(".wikipedia-math-wrapper");
        if (   mathWrapper.previousSibling
            && mathWrapper.previousSibling.textContent.endsWith(" "))
            mathText = mathText.trim();

        mathWrapper.replaceChildren(document.createTextNode(mathText));
    });

    return true;
});

/******************************************************************************/
/*  Makes double-clicking on a math element select the entire math element.
    (This actually makes no difference to the behavior of the copy listener
     [see the `addCopyProcessor` call above], which copies the entire LaTeX
     source of the full equation no matter how much of said equation is selected
     when the copy command is sent; however, it ensures that the UI communicates
     the actual behavior in a more accurate and understandable way.)
 */
addContentInjectHandler(GW.contentInjectHandlers.addDoubleClickListenersToMathBlocks = (eventInfo) => {
    GWLog("addDoubleClickListenersToMathBlocks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".mjpage").forEach(mathElement => {
        mathElement.addEventListener("dblclick", (event) => {
            document.getSelection().selectAllChildren(mathElement.querySelector(".mjx-chtml"));
        });
        mathElement.title = mathElement.classList.contains("mjpage__block")
                            ? "Double-click to select equation, then copy, to get LaTeX source (or, just click the Copy button in the top-right of the equation area)"
                            : "Double-click to select equation; copy to get LaTeX source";
    	mathElement.title += ": " + mathElement.querySelector(".mjx-math").getAttribute("aria-label");
    });
}, "eventListeners");

/****************************************************************/
/*  Add block buttons (copy) to block (not inline) math elements.
 */
addContentLoadHandler(GW.contentLoadHandlers.addBlockButtonsToMathBlocks = (eventInfo) => {
    GWLog("addBlockButtonsToMathBlocks", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".math.block").forEach(mathBlock => {
        //  Inject button bar.
        mathBlock.appendChild(newElement("SPAN", { class: "block-button-bar" })).append(
            newElement("BUTTON", {
                type: "button",
                class: "copy",
                tabindex: "-1",
                title: (  "Copy LaTeX source of this equation to clipboard"
                		+ ": " 
                		+ mathBlock.querySelector(".mjx-math").getAttribute("aria-label"))
            }, {
                innerHTML: GW.svg("copy-regular")
            }),
            newElement("SPAN", {
                class: "scratchpad"
            })
        );
    });
}, "rewrite");

/************************************************/
/*  Activate copy buttons of math block elements.
 */
addContentInjectHandler(GW.contentInjectHandlers.activateMathBlockButtons = (eventInfo) => {
    GWLog("activateMathBlockButtons", "rewrite.js", 1);

    eventInfo.container.querySelectorAll(".math.block").forEach(mathBlock => {
        //  LaTeX source.
        let latexSource = mathBlock.querySelector(".mjx-math").getAttribute("aria-label");

        //  Copy button (copies LaTeX source).
        mathBlock.querySelector("button.copy").addActivateEvent((event) => {
            GWLog("mathBlockCopyButtonClicked", "rewrite.js", 3);

            copyTextToClipboard(latexSource);

            //  Flash math block, for visual feedback of copy operation.
            let innerMathBlock = mathBlock.querySelector(".MJXc-display");
            innerMathBlock.classList.add("flash");
            setTimeout(() => { innerMathBlock.classList.remove("flash"); }, 150);
        });
    });
}, "eventListeners");


/**********************************/
/* BROKEN HTML STRUCTURE CHECKING */
/**********************************/

/*  Check for #footnotes outside of #markdownBody, which indicates a prematurely
    closed div#markdownBody (probably due to some error in the page source).
 */
doWhenPageLoaded(() => {
    let footnotesSection = document.querySelector("#footnotes");
    if (   footnotesSection
        && footnotesSection.closest("#markdownBody") == null)
        GWServerLogError(location.href + "--broken-html-structure");
});


/**************************/
/* BROKEN ANCHOR CHECKING */
/**************************/
/*  If a reader loads a page and the anchor ID/hash does not exist inside the page,
    fire off a request to the 404 page, whose logs are reviewed manually,
    with the offending page+anchor ID, for correction (either fixing an outdated
    link somewhere on gwern.net, or adding a span/div manually to the page to
    make old inbound links go where they ought to).

    Such broken anchors can reflect out of date cross-page references, or reflect
    incoming URLs from elsewhere on the Internet which are broken/outdated.
    (Within-page anchor links are checked statically at compile-time, and those
     errors should never exist.)
 */

function reportBrokenAnchorLink(link) {
    GWLog("reportBrokenAnchorLink", "rewrite.js", 1);

    if (link.hash == "")
        return;

    GWServerLogError(fixedEncodeURIComponent(link.pathname) + "--" + fixedEncodeURIComponent(link.hash.substr(1)), "broken hash-anchor");
}

/*  Check for broken anchor (location hash not pointing to any element on the
    page) both at page load time and whenever the hash changes.
 */
GW.notificationCenter.addHandlerForEvent("GW.hashHandlingSetupDidComplete", GW.brokenAnchorCheck = (eventInfo) => {
    GWLog("GW.brokenAnchorCheck", "rewrite.js", 1);

    if (   location.hash > ""
        && /^#if_slide/.test(location.hash) == false
        && /^#:~:/.test(location.hash) == false
        && document.querySelector(selectorFromHash(location.hash)) == null)
        reportBrokenAnchorLink(location);
}, { once: true });
GW.notificationCenter.addHandlerForEvent("GW.hashDidChange", GW.brokenAnchorCheck);


/************/
/* PRINTING */
/************/

/*********************************************************************/
/*  Trigger transcludes and expand-lock collapse blocks when printing.
 */
window.addEventListener("beforeprint", GW.beforePrintHandler = (event) => {
    GWLog("Print command received.", "rewrite.js", 1);

    function expand(container) {
        Transclude.allIncludeLinksInContainer(container).forEach(includeLink => {
            if (includeLink.closest("#link-bibliography, .link-bibliography-append"))
                return;

            Transclude.transclude(includeLink, true);
        });

        container.querySelectorAll(".collapse").forEach(expandLockCollapseBlock);
    }

    GW.notificationCenter.addHandlerForEvent("GW.contentDidInject", GW.expandAllContentWhenLoadingPrintView = (eventInfo) => {
        expand(eventInfo.container);
    }, {
        condition: (info) => (info.document == document)
    });

    expand(document);
});
window.addEventListener("afterprint", GW.afterPrintHandler = (event) => {
    GWLog("Print command completed.", "rewrite.js", 1);

    GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", GW.expandAllContentWhenLoadingPrintView);
});


/*****************************************************************************************/
/*! instant.page v5.1.0 - (C) 2019-2020 Alexandre Dieulot - https://instant.page/license */
/* Settings: 'prefetch' (loads HTML of target) after 1600ms hover (desktop) or mouse-down-click (mobile); TODO: left in logging for testing during experiment */
let pls="a:not(.has-content)";let t,e;const n=new Set,o=document.createElement("link"),z=o.relList&&o.relList.supports&&o.relList.supports("prefetch")&&window.IntersectionObserver&&"isIntersecting"in IntersectionObserverEntry.prototype,s="instantAllowQueryString"in document.body.dataset,a=true,r="instantWhitelist"in document.body.dataset,c="instantMousedownShortcut"in document.body.dataset,d=1111;let l=1600,u=!1,f=!1,m=!1;if("instantIntensity"in document.body.dataset){const t=document.body.dataset.instantIntensity;if("mousedown"==t.substr(0,"mousedown".length))u=!0,"mousedown-only"==t&&(f=!0);else if("viewport"==t.substr(0,"viewport".length))navigator.connection&&(navigator.connection.saveData||navigator.connection.effectiveType&&navigator.connection.effectiveType.includes("2g"))||("viewport"==t?document.documentElement.clientWidth*document.documentElement.clientHeight<45e4&&(m=!0):"viewport-all"==t&&(m=!0));else{const e=parseInt(t);isNaN(e)||(l=e)}}if(z){const n={capture:!0,passive:!0};if(f||document.addEventListener("touchstart",function(t){e=performance.now();const n=t.target.closest(pls);if(!h(n))return;v(n.href)},n),u?c||document.addEventListener("mousedown",function(t){const e=t.target.closest(pls);if(!h(e))return;v(e.href)},n):document.addEventListener("mouseover",function(n){if(performance.now()-e<d)return;const o=n.target.closest(pls);if(!h(o))return;o.addEventListener("mouseout",p,{passive:!0}),t=setTimeout(()=>{v(o.href),t=void 0},l)},n),c&&document.addEventListener("mousedown",function(t){if(performance.now()-e<d)return;const n=t.target.closest("a");if(t.which>1||t.metaKey||t.ctrlKey)return;if(!n)return;n.addEventListener("click",function(t){1337!=t.detail&&t.preventDefault()},{capture:!0,passive:!1,once:!0});const o=new MouseEvent("click",{view:window,bubbles:!0,cancelable:!1,detail:1337});n.dispatchEvent(o)},n),m){let t;(t=window.requestIdleCallback?t=>{requestIdleCallback(t,{timeout:1500})}:t=>{t()})(()=>{const t=new IntersectionObserver(e=>{e.forEach(e=>{if(e.isIntersecting){const n=e.target;t.unobserve(n),v(n.href)}})});document.querySelectorAll("a").forEach(e=>{h(e)&&t.observe(e)})})}}function p(e){e.relatedTarget&&e.target.closest("a")==e.relatedTarget.closest("a")||t&&(clearTimeout(t),t=void 0)}function h(t){if(t&&t.href&&(!r||"instant"in t.dataset)&&(a||t.origin==location.origin||"instant"in t.dataset)&&["http:","https:"].includes(t.protocol)&&("http:"!=t.protocol||"https:"!=location.protocol)&&(s||!t.search||"instant"in t.dataset)&&!(t.hash&&t.pathname+t.search==location.pathname+location.search||"noInstant"in t.dataset))return!0}function v(t){if(n.has(t))return;const e=document.createElement("link");console.log("Prefetched: "+t);e.rel="prefetch",e.href=t,document.head.appendChild(e),n.add(t)};
/*************************/
/*	Configuration / state.
 */
GW.collapse = {
	/*	Visibility of block collapse labels depends on how many times the user 
		has used them already.
	 */
	alwaysShowCollapseInteractionHints: (getSavedCount("clicked-to-expand-collapse-block-count") < (GW.isMobile() ? 6 : 3)),
	showCollapseInteractionHintsOnHover: (   GW.isMobile() == false 
										  && getSavedCount("clicked-to-expand-collapse-block-count") < 6),

	/*	Hover events (see below).
	 */
	hoverEventsEnabled: (GW.isMobile() == false),
	hoverEventsActive: (GW.isMobile() == false)
};

/****************************************************************************/
/*	On desktop, disable hover events on scroll; re-enable them on mouse move.
 */
if (GW.collapse.hoverEventsEnabled) {
	//	Disable on scroll.
	addScrollListener(GW.collapse.disableCollapseHoverEventsOnScroll = (event) => {
		GW.collapse.hoverEventsActive = false;
	}, {
		name: "disableCollapseHoverEventsOnScrollListener"
	});

	/*	Add event handler to add scroll listener to spawned popups, to
		disable hover events when scrolling within a popup.
	 */
	GW.notificationCenter.addHandlerForEvent("Popups.popupDidSpawn", GW.collapse.addDisableHoverEventsOnScrollListenerOnPopupSpawned = (info) => {
		addScrollListener(GW.collapse.disableCollapseHoverEventsOnScroll, {
			target: info.popup.scrollView
		});
	});

	//	Enable on mousemove.
	addMousemoveListener(GW.collapse.enableCollapseHoverEventsOnMousemove = (event) => {
		GW.collapse.hoverEventsActive = true;
	}, {
		name: "enableCollapseHoverEventsOnMousemoveListener"
	});
}

/******************************************************************************/
/*  Expand all collapse blocks containing the given node, if any (including the 
	node itself, if it is a collapse block). Returns true if any such expansion
	occurred. 

	Available option fields:

	fireStateChangedEvent (boolean)
		Fire a `Collapse.collapseStateDidChange` event after all (possibly 
		recursive) expansion is completed. (Only one event fired per 
		non-recursive call to expandCollapseBlocksToReveal(), even if recursive
		expansion occurred.)
 */
function expandCollapseBlocksToReveal(node, options) {
    GWLog("expandCollapseBlocksToReveal", "collapse.js", 2);

	options = Object.assign({
		fireStateChangedEvent: true
	}, options);

	if (node == null)
		return;

    // If the node is not an element (e.g. a text node), get its parent element.
    let element = node instanceof HTMLElement ? node : node.parentElement;

    /*  If the given element is not within any collapsed block, there is nothing
        to do.
     */
    if (isWithinCollapsedBlock(element) == false)
    	return false;

    //  Determine if nearest collapse block needs expanding.
    let collapseBlock = element.closest(".collapse");
    let expand = (isCollapsed(collapseBlock) == true);

    /*  Expand any higher-level collapse blocks.
		Fire state change event only if we will not have to expand this block
		(otherwise we’ll do redundant layout).
     */
	let expandedAncestor = expandCollapseBlocksToReveal(collapseBlock.parentElement, {
		fireStateChangedEvent: (expand == false)
	});

    if (expand) {
		//	Expand nearest collapse block.
		toggleCollapseBlockState(collapseBlock, expand);

		/*	Fire state change event only if we will not have to do any more 
			expansion (otherwise we’ll do redundant layout).
		 */
		if (options.fireStateChangedEvent) {
			GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
				source: "expandCollapseBlocksToReveal",
				collapseBlock: collapseBlock
			});
		}
	}

    //  Report whether we had to expand a collapse block.
    return (expand || expandedAncestor);
}

/******************************************************************************/
/*	Collapse the specified collapse block and all collapse blocks nested within 
	it, if any.

	Available option fields:

	fireStateChangedEvent (boolean)
		Fire a `Collapse.collapseStateDidChange` event after all (possibly 
		recursive) collapsing is completed. (Only one event fired per 
		non-recursive call to expandCollapseBlocksToReveal(), even if recursive
		collapsing occurred.)
 */
function collapseCollapseBlock(collapseBlock, options) {
    GWLog("collapseCollapseBlock", "collapse.js", 2);

	options = Object.assign({
		fireStateChangedEvent: true
	}, options);

	if (isCollapsed(collapseBlock))
		return;

	/*	Collapse any nested collapse blocks. Fire no state change events when
		doing so; we will fire a single event, once we’ve collapsed the 
		specified collapse block, after all of its nested collapse blocks are 
		collapsed.
	 */
	collapseBlock.querySelectorAll(".collapse").forEach(nestedCollapseBlock => {
		collapseCollapseBlock(nestedCollapseBlock, {
			fireStateChangedEvent: false
		});
	});

	//	Collapse block.
	toggleCollapseBlockState(collapseBlock, false);

	//	Fire event, if need be.
	if (options.fireStateChangedEvent) {
    	GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
    		source: "collapseCollapseBlock",
    		collapseBlock: collapseBlock
    	});
	}
}

/*******************************************************************/
/*  Returns true if the given collapse block is currently collapsed.
 */
function isCollapsed(collapseBlock) {
	if (collapseBlock.classList.contains("expanded"))
		return false;
		
	if (collapseBlock.classList.contains("expanded-not"))
		return true;
		
    return undefined;
}

/*****************************************************************************/
/*  Returns true if the given element is within a currently-collapsed collapse
    block.
 */
function isWithinCollapsedBlock(element) {
    /*  If the element is not within a collapse block at all, it obviously can't
        be within a *currently-collapsed* collapse block.
     */
    let collapseParent = element.closest(".collapse");
    if (collapseParent == null)
    	return false;

    /*  If the element is within a collapse block and that collapse block is
        currently collapsed, then the condition is satisfied...
     */
    if (   isCollapsed(collapseParent) == true
    	|| isCollapsed(collapseParent) == undefined)
    	return true;

    /*  BUT the collapse block that the element is in, even if *it* is not
        itself collapsed, could be *within* another collapse block!
     */
    return isWithinCollapsedBlock(collapseParent.parentElement);
}

/************************************************************************/
/*	Returns true iff element’s immediate children include any block-level 
	elements.
 */
function containsBlockChildren(element) {
	for (child of element.children) {
		if ([ "DIV", "P", "UL", "LI", "SECTION", "BLOCKQUOTE", "FIGURE" ].includes(child.tagName))
			return true;
		if (   child.tagName == "A"
			&& Transclude.isIncludeLink(child))
			return true;
	}

	return false;
}

/****************************************************************************/
/*	Constructs and returns a disclosure button.

	Available option fields:

	block (boolean)
		If `true`, the constructed button is for a block collapse; otherwise,
		the button is for an inline collapse.

	start (boolean)
		If `true`, the button is for placement at the start of an inline 
		collapse; otherwise, the button is for placement at the end of an 
		inline collapse. (Ignored for block collapse buttons.)
 */
function newDisclosureButton(options) {
	options = Object.assign({
		block: true,
		start: true
	}, options);

	let className = "disclosure-button" + (options.block ? "" : (" " + (options.start ? "start" : "end")));
	let disclosureButtonHTML = `<button type="button" class="${className}" tabindex="-1" aria-label="Open/close collapsed section">`;
	if (options.block) {
		disclosureButtonHTML += `<span class="part top">`
								 + `<span class="label"></span>`
								 + `<span class="icon">`
									+ GW.svg("chevron-left-solid")
								 + `</span>`
							  + `</span>`
							  + `<span class="part bottom">`
							  	 + `<span class="label"></span>`
								 + `<span class="icon">`
									+ GW.svg("chevron-left-solid")
								 + `</span>`
							  + `</span>`;
	} else {
		disclosureButtonHTML += `<span class="icon">`
							  + (options.start
								 ? GW.svg("bracket-square-left-sharp-light")
								 : (  GW.svg("angle-right-regular")
									+ GW.svg("bracket-square-right-sharp-light")))
							  + `</span>`;
	}
	disclosureButtonHTML += `</button>`;

	return elementFromHTML(disclosureButtonHTML);
}

/****************************************************************************/
/*	Before preparing collapse blocks, rectify collapse abstract tag mismatch, 
	namely cases where a div.abstract (or a section.abstract, etc.) has a 
	span.abstract-collapse; also fix erroneous HTML structure caused by 
	well-meaning but misguided Pandoc HTML structure rectification (namely, 
	wrapping a span.collapse in a <p>) applied to such cases.
 */
addContentLoadHandler(GW.contentLoadHandlers.preprocessMismatchedCollapseHTML = (eventInfo) => {
	GWLog("preprocessMismatchedCollapseHTML", "collapse.js", 1);

	let possiblyMismatchedAbstractCollapseBlockTags = [
		"div",
		"section"
	];
	let possiblyMismatchedAbstractSelector = possiblyMismatchedAbstractCollapseBlockTags.map(tagSelector => 
		`${tagSelector}.collapse span.abstract-collapse`
	).join(", ");

	eventInfo.container.querySelectorAll(possiblyMismatchedAbstractSelector).forEach(possiblyMismatchedAbstract => {
		let containingCollapse = possiblyMismatchedAbstract.closest(".collapse");
		if (possiblyMismatchedAbstractCollapseBlockTags.includes(containingCollapse.tagName.toLowerCase())) {
			possiblyMismatchedAbstract.parentElement.parentElement.insertBefore(possiblyMismatchedAbstract, possiblyMismatchedAbstract.parentElement);
			rewrapContents(possiblyMismatchedAbstract, "div", {
				moveClasses: true
			});
		}
	});
}, "rewrite");

/***********************************************************************/
/*  Inject disclosure buttons and otherwise prepare the collapse blocks.
 */
addContentLoadHandler(GW.contentLoadHandlers.prepareCollapseBlocks = (eventInfo) => {
	GWLog("prepareCollapseBlocks", "collapse.js", 1);

	//  Construct all collapse blocks (in correct final state).
	eventInfo.container.querySelectorAll(".collapse").forEach(collapseBlock => {
		//	Compensate for Pandoc putting .collapse class on headings.
		if ([ "H1", "H2", "H3", "H4", "H5", "H6" ].includes(collapseBlock.tagName)) {
			collapseBlock.classList.remove("collapse");
			if (collapseBlock.className == "")
				collapseBlock.removeAttribute("class");

			return;
		}

		//	Should the collapse block start out already expanded?
		let startExpanded = (   collapseBlock.contains(getHashTargetedElement()) == true
							 || collapseBlock.classList.contains("start-expanded") == true);

		//	The collapse block might already be prepared.
		if (collapseBlock.classList.containsAnyOf([ "collapse-block", "collapse-inline" ])) {
			if (isCollapsed(collapseBlock) == startExpanded)
				collapseBlock.swapClasses([ "expanded", "expanded-not" ], startExpanded ? 0 : 1);

			return;
		}

		if (GW.collapse.hoverEventsEnabled)
			collapseBlock.classList.add("expand-on-hover");

		let collapseWrapper;
		let wrapOptions = {
			useExistingWrapper: true, 
			moveClasses: [ "collapse", "expand-on-hover" ]
		};
		let bareContentSelector = [ 
			"p",
			".list"
		].join(", ");
		if ([ "DIV", "SECTION", "SPAN", "A" ].includes(collapseBlock.tagName)) {
			//	Handle collapse-inducing include-links.
			if (collapseBlock.tagName == "A")
				collapseBlock = wrapElement(wrapElement(collapseBlock, "p", wrapOptions), "div", wrapOptions);

			//	No additional wrapper needed for these tag types.
			collapseWrapper = collapseBlock;

			//	Check for empty collapses; if empty, log error and do nothing.
			if (isNodeEmpty(collapseWrapper)) {
				let collapseWrapperTagName = collapseWrapper.tagName.toLowerCase()
				GWServerLogError(eventInfo.loadLocation.href + `--empty-collapse-${collapseWrapperTagName}`, 
								 `empty collapse element (${collapseWrapperTagName})`);

				return;
			}

			/*	Rewrap spans that are NOT inline collapses (i.e., those that
				are, for some reason, wrapping block-level content).
			 */
			if (   collapseWrapper.tagName == "SPAN"
				&& containsBlockChildren(collapseWrapper))
				collapseWrapper = rewrapContents(collapseWrapper, "div", {
					useExistingWrapper: true,
					moveClasses: true
				});

			//	Designate collapse type (block or inline).
			if ([ "SPAN" ].includes(collapseWrapper.tagName))
				collapseWrapper.classList.add("collapse-inline");
			else
				collapseWrapper.classList.add("collapse-block");

			/*	Abstracts (the .abstract class) can end up in collapses
				without this being known in advance, so may not have the
				.abstract-collapse class, as they should.
			 */
			let collapseAbstract = collapseWrapper.querySelector(".collapse > .abstract");
			if (collapseAbstract?.closest(".collapse") == collapseWrapper)
				collapseAbstract.classList.add("abstract-collapse");

			//	Ensure correct structure and classes of abstracts.
			let collapseAbstractSelector = [
				".abstract-collapse",
				".abstract-collapse-only"
			].map(x => `.collapse > ${x}`).join(", ");
			collapseAbstract = collapseWrapper.querySelector(collapseAbstractSelector);
			if (collapseAbstract?.closest(".collapse") == collapseWrapper) {
				//	Mark those collapse blocks that have abstracts.
				collapseWrapper.classList.add("has-abstract");

				//	Wrap bare text nodes and inline elements in <p> elements.
				if (collapseWrapper.classList.contains("collapse-block"))
					paragraphizeTextNodesOfElementRetainingMetadata(collapseAbstract);

				//	Make sure “real” abstracts are marked as such.
				if (   collapseWrapper.classList.contains("collapse-block")
					&& collapseAbstract.firstElementChild?.tagName == "BLOCKQUOTE")
					collapseAbstract.classList.add("abstract");
			} else {
				if (collapseWrapper.classList.contains("collapse-inline")) {
					/*	Add default abstract (just an ellipsis) to inline
						collapses that have no abstract.
					 */
					collapseWrapper.insertBefore(collapseAbstract = newElement("span", {
						class: "abstract-collapse-only"
					}, {
						innerHTML: " …"
					}), collapseWrapper.firstChild);

					//	Mark with a special class.
					collapseWrapper.classList.add("collapse-inline-special");
				} else {
					//	Mark those collapse blocks that have no abstracts.
					collapseWrapper.classList.add("no-abstract");
				}
			}

			//	Designate “bare content” collapse blocks.
			if (   collapseWrapper.classList.contains("collapse-block") == true
				&& collapseWrapper.classList.contains("bare-content-not") == false
				&& collapseWrapper.tagName != "SECTION") {
				if (   collapseWrapper.firstElementChild.matches(bareContentSelector)
					|| (   collapseWrapper.classList.contains("has-abstract")
						&& collapseWrapper.querySelector(collapseAbstractSelector).firstElementChild.matches(bareContentSelector)))
					collapseWrapper.classList.add("bare-content");
			}
		} else {
			/*	Additional wrapper is required for most tag types. We use a 
				block collapse here. Collapse blocks of this type never have 
				abstracts.
			 */
			collapseWrapper = wrapElement(collapseBlock, "div.collapse-block.no-abstract", wrapOptions);

			//	Designate “bare content” collapse blocks.
			if (collapseWrapper.firstElementChild.matches(bareContentSelector))
				collapseWrapper.classList.add("bare-content");
		}

		//	Slight HTML structure rectification.
		if (   collapseWrapper.parentElement
			&& [ "P" ].includes(collapseWrapper.parentElement.tagName) == true
			&& [ "SPAN" ].includes(collapseWrapper.tagName) == false
			&& isOnlyChild(collapseWrapper))
			unwrap(collapseWrapper.parentElement);

		//	Construct collapse content wrapper.
		let collapseContentWrapperTagName = collapseWrapper.tagName == "SPAN" ? "SPAN" : "DIV";
		let collapseContentWrapper = newElement(collapseContentWrapperTagName, { "class": "collapse-content-wrapper" });
		let childNodesArray = Array.from(collapseWrapper.childNodes);
		collapseContentWrapper.append(...childNodesArray.slice(childNodesArray.findLastIndex(node => {
			return (   node instanceof Element 
					&& node.matches(".heading, .abstract-collapse, .abstract-collapse-only"));
		}) + 1));
		collapseWrapper.append(collapseContentWrapper);

		//  Inject the disclosure button.
		if (collapseWrapper.classList.contains("collapse-inline")) {
			//	Additional wrapper for inline collapses.
			let collapseContentOuterWrapper = wrapElement(collapseContentWrapper, "span.collapse-content-outer-wrapper");
			
			//	Button at start.
			collapseContentOuterWrapper.insertBefore(newDisclosureButton({ block: false, start: true }),
													 collapseContentOuterWrapper.firstChild);

			//	Button at end.
			collapseContentOuterWrapper.insertBefore(newDisclosureButton({ block: false, start: false }),
													 null);
		} else {
			collapseWrapper.insertBefore(newDisclosureButton({ block: true }),
										 collapseContentWrapper);
		}

		//	Inject the size indicator.
		let icebergWhere = collapseWrapper.classList.contains("collapse-block")
						   ? collapseWrapper.querySelector(".disclosure-button")
						   : collapseWrapper.querySelector(".disclosure-button.end");
		icebergWhere.appendChild(newElement("SPAN", {
			"class": "collapse-iceberg-indicator graf-content-not"
		}));

		//	Mark as expanded, if need be.
		collapseWrapper.swapClasses([ "expanded", "expanded-not" ], startExpanded ? 0 : 1)

		//	Fire event.
		if (startExpanded) {
			GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
				source: "prepareCollapseBlocks",
				collapseBlock: collapseWrapper
			});
		}
	});
}, "rewrite");

/*****************************************************************************/
/*	Ensure that top part of disclosure button (including chevron icon) matches
	height of section heading text, for section collapses.
 */
addContentInjectHandler(GW.contentInjectHandlers.rectifySectionCollapseLayout = (eventInfo) => {
	GWLog("rectifySectionCollapseLayout", "collapse.js", 1);

	eventInfo.container.querySelectorAll("section.collapse").forEach(section => {
		section.style.removeProperty("--collapse-toggle-top-height");
		section.style.removeProperty("--collapse-toggle-top-icon-size");

		requestIdleCallback(() => {
			let rects = Array.from(section.firstElementChild.querySelector("a").getClientRects());
			let oneLineHeight = rects.first?.height ?? 0;
			let totalHeight = rects.reduce((h, r) => h + r.height, 0);
			if (   oneLineHeight == 0
				|| totalHeight == 0)
				return;

			section.style.setProperty("--collapse-toggle-top-height", Math.round(totalHeight + oneLineHeight * 0.15) + "px");
			section.style.setProperty("--collapse-toggle-top-icon-size", Math.round(oneLineHeight * 1.15) + "px");

			GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
				source: "Collapse.rectifySectionCollapseLayout",
				collapseBlock: section
			});
		});
	});
}, ">rewrite");

/******************************************************************************/
/*  Collapse all expanded collapse blocks. (Mostly relevant when popping up
	sections of an already-displayed full page, which may have collapses in it,
	which have already been expanded, but which we do not want to be expanded
	when the sections containing them appear in a new context.)
 */
addContentInjectHandler(GW.contentInjectHandlers.collapseExpandedCollapseBlocks = (eventInfo) => {
	GWLog("collapseExpandedCollapseBlocks", "collapse.js", 1);

	eventInfo.container.querySelectorAll(".collapse.expanded:not(.start-expanded)").forEach(collapseCollapseBlock);
}, "<eventListeners");

/*****************************************************************************/
/*	Updates disclosure button label for current UI state.

	Available option fields:

	showLabels (boolean)
		If `true`, disclosure button labels are visible by default. (Applies 
		only to block collapses, as inline collapses have no disclosure button
		labels.) 

		NOTE: This option is ignored if 
		GW.collapse.alwaysShowCollapseInteractionHints is `true`.
 */
function updateDisclosureButtonState(collapseBlock, options) {
	GWLog("updateDisclosureButtonState", "collapse.js", 2);

	options = Object.assign({
		showLabels: false
	}, options);

	let action = GW.isMobile() ? "Tap" : "Click";
	let labelText = isCollapsed(collapseBlock)
					? `${action} to expand`
					: `${action} to collapse`;

	if (collapseBlock.classList.contains("collapse-block")) {
		let disclosureButton = collapseBlock.querySelector(".disclosure-button");

		disclosureButton.querySelectorAll(".part .label").forEach(label => {
			label.innerHTML = labelText;
		});

		disclosureButton.classList.toggle("labels-visible", options.showLabels || GW.collapse.alwaysShowCollapseInteractionHints);
	} else { //	Inline collapse.
		collapseBlock.querySelectorAll(".disclosure-button").forEach(disclosureButton => {
			disclosureButton.title = labelText;
		});
	}

	let icebergIndicator = collapseBlock.querySelector(".collapse-iceberg-indicator");
	let progressPercentage = 100;
	if (isCollapsed(collapseBlock)) {
		if (collapseBlock.classList.contains("collapse-block")) {
			if (collapseBlock.classList.contains("no-abstract")) {
				let collapsedContentHeight = collapseBlock.querySelector(".collapse-content-wrapper").clientHeight;
				let contentHeight = Array.from(collapseBlock.querySelector(".collapse-content-wrapper").children).reduce((h, c) => h + c.clientHeight, 0);
				progressPercentage = Math.round(100 * Math.min(1, collapsedContentHeight / contentHeight));
			} else {
				let abstractHeight = collapseBlock.querySelector(".abstract-collapse, .abstract-collapse-only").clientHeight;
				let contentHeight = Array.from(collapseBlock.querySelector(".collapse-content-wrapper").children).reduce((h, c) => h + c.clientHeight, 0);
				progressPercentage = Math.round(100 * abstractHeight / (abstractHeight + contentHeight));
			}
		} else {
			let abstractLength = collapseBlock.querySelector(".abstract-collapse, .abstract-collapse-only").textContent.length;
			let contentLength = collapseBlock.querySelector(".collapse-content-wrapper").textContent.length;
			progressPercentage = Math.round(100 * abstractLength / (abstractLength + contentLength));
		}
	}
	icebergIndicator.dataset.progressPercentage = progressPercentage;
	renderProgressPercentageIcon(icebergIndicator);
}

/***************************************/
/*	Expand or collapse a collapse block.
 */
function toggleCollapseBlockState(collapseBlock, expanding, options) {
	options = Object.assign({
		triggeredByStateChangeOnElement: null,
	}, options);

	//	Satisfy selector-based state XOR condition.
	if (collapseBlock.dataset.collapseXorStateWithSelector > "") {
		let otherCollapseElement = collapseBlock.getRootNode().querySelector(collapseBlock.dataset.collapseXorStateWithSelector);
		if (   otherCollapseElement != options.triggeredByStateChangeOnElement
			&& otherCollapseElement.classList.contains("collapse")) {
			toggleCollapseBlockState(otherCollapseElement, expanding ? false : true, {
				triggeredByStateChangeOnElement: collapseBlock
			});
		}
	}

	//	Set proper classes.
	collapseBlock.swapClasses([ "expanded", "expanded-not" ], expanding ? 0 : 1);

	//	Update label text and other HTML-based UI state.
	updateDisclosureButtonState(collapseBlock, {
		showLabels: GW.collapse.showCollapseInteractionHintsOnHover
	});

	/*	Compensate for block indentation due to nesting (e.g., lists).

		(Don’t do this for full-width collapses, as the full-width code will
		 already apply suitable side margins.)

		(Also don’t do this for collapses in blockquotes, which get treated
		 specially.)
	 */
	if (   collapseBlock.classList.contains("collapse-block")
		&& collapseBlock.closest("blockquote") == null
		&& collapseBlock.querySelector(".collapse-content-wrapper").classList.contains("width-full") == false) {
		if (expanding) {
			let collapseBlockComputedStyle = getComputedStyle(collapseBlock);

			let collapseContentWrapper = collapseBlock.querySelector(".collapse-content-wrapper");
			let contentColumn = collapseBlock.closest(".sidenote, .markdownBody");
			if (contentColumn.matches(".sidenote"))
				return;

			let contentRect = collapseContentWrapper.getBoundingClientRect();
			let enclosingContentRect = contentColumn.getBoundingClientRect();
			let collapseLeftOffsetPx = collapseBlockComputedStyle.getPropertyValue("--collapse-left-offset");
			let collapseLeftBorderWidth = parseInt(collapseBlockComputedStyle.getPropertyValue("border-left"))
			let floatOffset = 0;

			//	Compensate for TOC.
			if (   collapseBlock.tagName != "SECTION"
				&& contentColumn.id == "markdownBody") {
				let TOC = document.querySelector("#TOC");
				if (TOC) {
					let TOCRect = TOC.getBoundingClientRect();
					if (TOCRect.bottom > contentRect.top) {
						floatOffset = Math.round(  TOCRect.width 
												 + parseInt(getComputedStyle(TOC).marginRight)
												 + parseInt(collapseBlockComputedStyle.paddingLeft));
					}
				}
			}

			collapseBlock.style.marginLeft = `calc(${(enclosingContentRect.x - contentRect.x)}px - ${collapseLeftOffsetPx} + ${floatOffset}px + ${collapseLeftBorderWidth}px)`;
		} else { // if (collapsing)
			collapseBlock.style.marginLeft = "";
		}
	}
}

/*************************************************/
/*  Add event listeners to the disclosure buttons.
 */
addContentInjectHandler(GW.contentInjectHandlers.activateCollapseBlockDisclosureButtons = (eventInfo) => {
	GWLog("activateCollapseBlockDisclosureButtons", "collapse.js", 1);

    //  Add listeners to collapse block disclosure buttons.
	eventInfo.container.querySelectorAll(".disclosure-button").forEach(disclosureButton => {
		if (disclosureButton.actionHandler)
			return;

		let collapseBlock = disclosureButton.closest(".collapse");

		updateDisclosureButtonState(collapseBlock);

		disclosureButton.addActivateEvent(disclosureButton.actionHandler = (event) => {
			GWLog("Collapse.collapseBlockDisclosureButtonActivated", "collapse.js", 2);

			//	Nullify accidental late clicks in block collapses.
			if (   collapseBlock.classList.contains("collapse-block")
				&& collapseBlock.classList.contains("just-auto-expanded"))
				return;

			//	Expanding? Collapsing? (For readability and consistency.)
			let expanding = (isCollapsed(collapseBlock) == true);
			let collapsing = (isCollapsed(collapseBlock) == false);

			//	Keep count of clicks to uncollapse.
			if (   expanding
				&& collapseBlock.classList.contains("collapse-block")
				&& event.type == "click")
				incrementSavedCount("clicked-to-expand-collapse-block-count");

			//	Expand or collapse.
			toggleCollapseBlockState(collapseBlock, expanding);

			/*	If a collapse block was collapsed from the bottom, it might now
				be up off the screen. Scroll it into view.
			 */
			if (   collapsing
				&& isOnScreen(collapseBlock) == false)
				scrollElementIntoView(collapseBlock);
			/*	If a collapse block was expanded from the bottom, the top of the
				collapse block might be up off the screen. Scroll it into view.
			 */
			else if (   expanding
					 && collapseBlock.getBoundingClientRect().top < 0)
				scrollElementIntoView(collapseBlock);

			//	Update temporary state.
			if (   collapseBlock.classList.contains("expand-on-hover")
				&& GW.collapse.hoverEventsEnabled) {
				let tempClass = null;
				switch (event.type) {
				case "click":
					tempClass = "just-clicked"; break;
				case "mouseenter":
					tempClass = "just-auto-expanded"; break;
				}
				if (tempClass) {
					collapseBlock.classList.add(tempClass);
					collapseBlock.addEventListener("mouseleave", (event) => {
						collapseBlock.classList.remove(tempClass);
					}, { once: true });
				}
			}

			GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
				source: "Collapse.collapseBlockDisclosureButtonStateChanged",
				collapseBlock: collapseBlock
			});
		});

		//	Collapse block expand-on-hover.
		if (   collapseBlock.classList.contains("expand-on-hover")
			&& GW.collapse.hoverEventsEnabled) {
			collapseBlock.addEventListener("mouseenter", (event) => {
				if (GW.collapse.hoverEventsActive == false) {
					collapseBlock.classList.add("hover-not");
				} else {
					collapseBlock.classList.remove("hover-not");
				}
			});
			onEventAfterDelayDo(collapseBlock, "mouseenter", 1000, (event) => {
				if (GW.collapse.hoverEventsActive == false)
					return;

				if (isCollapsed(collapseBlock) == false)
					return;

				if (collapseBlock.classList.contains("just-clicked"))
					return;

				disclosureButton.actionHandler(event);
			}, {
				cancelOnEvents: [ "mouseleave", "mousedown" ]
			});
		}

		//	On-hover state changes.
		if (GW.collapse.hoverEventsEnabled) {
			//	Add listener to show labels on hover, if need be.
			if (   collapseBlock.classList.contains("collapse-block")
				&& GW.collapse.showCollapseInteractionHintsOnHover == true
				&& GW.collapse.alwaysShowCollapseInteractionHints == false) {
				disclosureButton.addEventListener("mouseenter", (event) => {
					if (GW.collapse.hoverEventsActive == false)
						return;

					updateDisclosureButtonState(collapseBlock, {
						showLabels: true
					});
				});
				disclosureButton.addEventListener("mouseleave", (event) => {
					if (GW.collapse.hoverEventsActive == false)
						return;

					updateDisclosureButtonState(collapseBlock);
				});
			}

			//	Add listeners to highlight counterpart at other end.
			if (   collapseBlock.classList.contains("collapse-inline")
				&& disclosureButton.classList.containsAnyOf([ "start", "end" ])) {
				let counterpart = disclosureButton.classList.contains("end")
								  ? collapseBlock.querySelector(".disclosure-button")
								  : collapseBlock.querySelector(".collapse-content-wrapper").nextElementSibling;
				disclosureButton.addEventListener("mouseenter", (event) => {
					if (GW.collapse.hoverEventsActive == false)
						return;

					counterpart.classList.add("hover");
				});
				disclosureButton.addEventListener("mouseleave", (event) => {
					if (GW.collapse.hoverEventsActive == false)
						return;

					counterpart.classList.remove("hover");
				});
			}
		}
	});
}, "eventListeners");

/************************************************************************/
/*	Permanently expand a collapse block and remove its disclosure button.
 */
function expandLockCollapseBlock(collapseBlock) {
	//	Remove disclosure button.
	collapseBlock.querySelector(".disclosure-button").remove();

	//	Expand.
	let wasCollapsed = (isCollapsed(collapseBlock) == true);

	//	Strip collapse-specific classes.
	collapseBlock.classList.remove("collapse", "collapse-block", "collapse-inline", "expanded", "expanded-not", "expand-on-hover", "has-abstract", "no-abstract", "bare-content", "file-include-collapse", "expanded", "expanded-not");
	if (collapseBlock.className == "")
		collapseBlock.removeAttribute("class");

	//	Strip collapse-specific styles.
	collapseBlock.style.removeProperty("margin");
	collapseBlock.style.removeProperty("--collapse-toggle-top-height");
	collapseBlock.style.removeProperty("--collapse-toggle-top-icon-size");
	if (collapseBlock.style == "")
		collapseBlock.removeAttribute("style");

	//	Unwrap subordinate containers.
	Array.from(collapseBlock.children).filter(x => x.matches([
		".collapse-content-outer-wrapper",
		".collapse-content-wrapper",
		".abstract-collapse:not(.abstract)"
	].join(", "))).forEach(unwrap);
	
	//	Unwrap collapse block itself if it’s a bare wrapper.
	if (   isBareWrapper(collapseBlock)
		&& isOnlyChild(collapseBlock.firstElementChild))
		unwrap(collapseBlock);

	//	Fire event.
	if (wasCollapsed) {
		GW.notificationCenter.fireEvent("Collapse.collapseStateDidChange", {
			source: "Collapse.expandLockCollapseBlocks",
			collapseBlock: collapseBlock
		});
	}
}

/**********************************************************/
/*	Removes disclosure buttons and expands collapse blocks.
 */
addContentInjectHandler(GW.contentInjectHandlers.expandLockCollapseBlocks = (eventInfo) => {
	GWLog("expandLockCollapseBlocks", "collapse.js", 2);

	//  Permanently expand collapse blocks (by making them into regular blocks).
	eventInfo.container.querySelectorAll(".collapse").forEach(expandLockCollapseBlock);
}, "<rewrite", (info) => info.stripCollapses);

/*******************************************************************************/
/*	Ensure that the given element is scrolled into view when layout is complete.

	NOTE: In most cases when this function would be used, it is better to use
	the revealElement() function instead, as otherwise, if the element is inside
	a collapsed block, it will be scrolled into view but not actually visible on
	the screen, frustrating the user.
		Outside of this file (where scrollElementIntoView() is used in the 
	collapse code itself), this function should generally be called directly 
	only if (a) expansion of any collapse blocks involved is explicitly *not* 
	desired, or (b) expansion is being done separately (i.e., by calling 
	revealElement() and passing `false` as the value of the `scrollIntoView`
	option; generally, this should be done *before* scrolling an element into 
	view!), with some other operations intervening between revealing and
	scrolling into view.

	Available option fields:

	offset (float)
		If element is in the base page (and not in a pop-frame, etc.), then,
		after scrolling the element into view, scroll the page down by the given
		offset. (If the element is in a pop-frame or similar, `offset` is
		ignored.)
 */
function scrollElementIntoView(element, options) {
    GWLog("scrollElementIntoView", "collapse.js", 2);

	options = Object.assign({
		offset: 0
	}, options);

	if (   Extracts 
		&& Extracts.popFrameProvider
		&& Extracts.popFrameProvider.containingPopFrame(element)) {
		Extracts.popFrameProvider.scrollElementIntoViewInPopFrame(element);
	} else {	
		doWhenPageLayoutComplete(() => {
			element.scrollIntoView();
			if (options.offset != 0)
				window.scrollBy(0, options.offset);
			updateScrollState();
		});
	}
}

/****************************************************************************/
/*	Expand collapse blocks to reveal the given element.

	Available option fields:

	scrollIntoView (boolean)
		After expanding collapse blocks to reveal the element, scroll it into
		view.

	offset (float)
		If `scrollIntoView` is `true`, then `offset` is passed to 
		scrollElementIntoView() as an option.
 */
function revealElement(element, options) {
    GWLog("revealElement", "collapse.js", 2);

	options = Object.assign({
		scrollIntoView: true,
		offset: 0
	}, options);

	let didExpandCollapseBlocks = expandCollapseBlocksToReveal(element);

	if (options.scrollIntoView) {
		if (didExpandCollapseBlocks) {
			requestAnimationFrame(() => {
				scrollElementIntoView(element, {
					offset: options.offset
				});		
			});
		} else {
			scrollElementIntoView(element, {
				offset: options.offset
			});
		}
	}

	return didExpandCollapseBlocks;
}

/***********************************************/
/*  Reveal the element targeted by the URL hash.

	Available option fields:

	offset (float)
		Passed to revealElement() as an option.
 */
function revealTarget(options) {
    GWLog("revealTarget", "collapse.js", 1);

	options = Object.assign({
		offset: 0
	}, options);

    let target = getHashTargetedElement();
    if (target == null)
    	return;

	let didReveal = revealElement(target, {
		offset: options.offset
	});

	//	Fire notification event.
	if (didReveal)
		GW.notificationCenter.fireEvent("Collapse.targetDidReveal");
}

/***************************************************************/
/*	On load and on hash change, reveal element targeted by hash.
 */
GW.notificationCenter.addHandlerForEvent("GW.hashHandlingSetupDidComplete", GW.revealTargetOnPageLayoutComplete = (info) => {
    GWLog("GW.revealTargetOnPageLayoutComplete", "collapse.js", 1);

	revealTarget();

	GW.notificationCenter.addHandlerForEvent("GW.hashDidChange", GW.revealTargetOnHashChange = (info) => {
 		GWLog("GW.revealTargetOnHashChange", "collapse.js", 1);

		revealTarget();
	});
});

/*******************************************************************************/
/*	What happens when a user C-fs on a page and there is a hit *inside* a
	collapse block? Just navigating to the collapsed section is not useful,
	especially when there may be multiple collapses inside a frame. So we must
	specially handle searches and pop open collapse sections with matches. We do
	this by watching for selection changes. (We don’t bother checking for window
	focus/blur because that is unreliable and in any case doesn’t work for
	“Search Again” key command.)
 */
document.addEventListener("selectionchange", GW.selectionChangedRevealElement = (event) => {
	GWLog("GW.selectionChangedRevealElement", "collapse.js", 3);

	let newSelection = document.getSelection();
	if (   newSelection
		&& newSelection.rangeCount > 0
		&& newSelection.getRangeAt(0).toString().length > 0) {
		let element = (newSelection.anchorNode.nodeType === Node.ELEMENT_NODE
					   ? newSelection.anchorNode
					   : newSelection.anchorNode.parentElement);
		if (isWithinCollapsedBlock(element))
			revealElement(element);
	}
});
/*	sidenotes.js: standalone JS library for parsing HTML documents with
	Pandoc-style footnotes and dynamically repositioning them into the
	left/right margins, when browser windows are wide enough.

	Sidenotes (see https://gwern.net/sidenote ) are superior to footnotes where
	possible because they enable the reader to immediately look at them without
	requiring user action to “go to” or “pop up” the footnotes; even floating
	footnotes require effort by the reader.

	sidenotes.js is inspired by the Tufte-CSS sidenotes
	(https://edwardtufte.github.io/tufte-css/#sidenotes), but where Tufte-CSS
	uses static footnotes inlined into the body of the page (requiring
	modifications to Pandoc’s compilation), which doesn’t always work well for
	particularly long or frequent sidenotes, sidenotes.js will rearrange
	sidenotes to fit as best as possible, and will respond to window changes.

	Particularly long sidenotes are also partially “collapsed”. Styling
	(especially for oversized-sidenotes which must scroll) is done in
	/static/css/default.css “SIDENOTES” section.

	Author: Said Achmiz
	2019-03-11
	license: MIT (derivative of footnotes.js, which is PD)
 */

/*****************/
/*	Configuration.
 */
Sidenotes = {
	/*  The `sidenoteSpacing` constant defines the minimum vertical space that
		is permitted between adjacent sidenotes; any less, and they are
		considered to be overlapping.
	 */
	sidenoteSpacing: 60.0,

	/*	This includes the border width.
	 */
	sidenotePadding: 13.0,

	/*	Elements which occupy (partially or fully) the sidenote columns, and
		which can thus collide with sidenotes.
	 */
	potentiallyOverlappingElementsSelectors: [
		".width-full img",
		".width-full video",
		".width-full .caption-wrapper",
		".width-full table",
		".width-full pre",
		".marginnote"
	],

	constrainMarginNotesWithinSelectors: [
		".backlink-context",
		".margin-notes-block",
		".footnote",
		".sidenote > *"
	],

	/*	The smallest width (in CSS dimensions) at which sidenotes will be shown.
		If the viewport is narrower than this, then sidenotes are disabled.
	 */
	minimumViewportWidthForSidenotes: "1761px",

	/*	The smallest width (in CSS dimensions) at which margin notes will be
		shown as sidenotes. If the viewport is narrower than this, then margin
		notes will be inlined.
	 */
	minimumViewportWidthForSidenoteMarginNotes: "1497px",

	useLeftColumn: () => false,
	useRightColumn: () => true
};

/******************/
/*	Implementation.
 */
Sidenotes = { ...Sidenotes,
	/*  Media query objects (for checking and attaching listeners).
	 */
	mediaQueries: {
		viewportWidthBreakpoint: matchMedia(`(min-width: ${Sidenotes.minimumViewportWidthForSidenotes})`),
		marginNoteViewportWidthBreakpoint: matchMedia(`(min-width: ${Sidenotes.minimumViewportWidthForSidenoteMarginNotes})`)
	},

	/*****************/
	/* Infrastructure.
	 */
	sidenotes: null,
	citations: null,

	sidenoteColumnLeft: null,
	sidenoteColumnRight: null,

	hiddenSidenoteStorage: null,

	positionUpdateQueued: false,

	sidenoteOfNumber: (number) => {
		return (Sidenotes.sidenotes?.find(sidenote => Notes.noteNumber(sidenote) == number) ?? null);
	},

	citationOfNumber: (number) => {
		return (Sidenotes.citations?.find(citation => Notes.noteNumber(citation) == number) ?? null);
	},

	/*	The sidenote of the same number as the given citation;
		or, the citation of the same number as the given sidenote.
	 */
	counterpart: (element) => {
		if (element == null)
			return null;

		let number = Notes.noteNumber(element);
		let counterpart = (element.classList.contains("sidenote")
						   ? Sidenotes.citationOfNumber(number)
						   : Sidenotes.sidenoteOfNumber(number));
		if (counterpart == null)
			GWLog(`Counterpart of ${element.tagName}#${element.id}.${(Array.from(element.classList).join("."))} not found!`, "sidenotes.js", 0);

		return counterpart;
	},

	/*  The “target counterpart” is the element associated with the target, i.e.:
		if the URL hash targets a footnote reference, its counterpart is the
		sidenote for that citation; and vice-versa, if the hash targets a sidenote,
		its counterpart is the in-text citation. We want a target counterpart to be
		highlighted along with the target itself; therefore we apply a special
		‘targeted’ class to the target counterpart.
	 */
	updateTargetCounterpart: () => {
		GWLog("Sidenotes.updateTargetCounterpart", "sidenotes.js", 1);

		if (Sidenotes.mediaQueries.viewportWidthBreakpoint.matches == false)
			return;

		//  Clear existing targeting.
		let targetedElementSelector = [
			".footnote-ref",
			".footnote",
			".sidenote"
		].map(x => x + ".targeted").join(", ");
		document.querySelectorAll(targetedElementSelector).forEach(element => {
			element.classList.remove("targeted");
		});

		//  Identify target and counterpart, if any.
		let target = location.hash.match(/^#(sn|fnref)[0-9]+$/)
					 ? getHashTargetedElement()
					 : null;
		let counterpart = Sidenotes.counterpart(target);

		//  Mark the target and the counterpart, if any.
		if (target)
			target.classList.add("targeted");
		if (counterpart)
			counterpart.classList.add("targeted");
	},

	/*	Queues a sidenote position update on the next available animation frame,
		if an update is not already queued.
	 */
	updateSidenotePositionsIfNeeded: () => {
		if (Sidenotes.hiddenSidenoteStorage == null)
			return;

		if (Sidenotes.positionUpdateQueued)
			return;

		Sidenotes.positionUpdateQueued = true;
		requestIdleCallback(() => {
			Sidenotes.positionUpdateQueued = false;

			if (Sidenotes.sidenotesNeedConstructing)
				return;

			Sidenotes.updateSidenotePositions();
		});
	},

	updateStateAfterHashChange: () => {
		GWLog("Sidenotes.updateStateAfterHashChange", "sidenotes.js", 1);

		//	Update highlighted state of sidenote and citation, if need be.
		Sidenotes.updateTargetCounterpart();

		/*	If hash targets a sidenote, reveal corresponding citation; and
			vice-versa. Scroll everything into view properly.
		 */
		if (Notes.hashMatchesSidenote()) {
			let citation = document.querySelector("#" + Notes.citationIdForNumber(Notes.noteNumberFromHash()));
			if (citation == null)
				return;

			revealElement(citation, {
				scrollIntoView: false
			});

			let sidenote = Sidenotes.counterpart(citation);
			if (sidenote == null)
				return;

			Sidenotes.slideLockSidenote(sidenote);

			requestAnimationFrame(() => {
				scrollElementIntoView(sidenote, {
					offset: (-1 * (Sidenotes.sidenotePadding + 1))
				});

				Sidenotes.unSlideLockSidenote(sidenote);
			});
		} else if (Notes.hashMatchesCitation()) {
			let citation = getHashTargetedElement();
			if (citation == null)
				return;

			let sidenote = Sidenotes.counterpart(citation);
			if (sidenote == null)
				return;

			Sidenotes.slideLockSidenote(sidenote);

			requestAnimationFrame(() => {
				let sidenoteRect = sidenote.getBoundingClientRect();
				let citationRect = citation.getBoundingClientRect();
				if (   sidenoteRect.top < Sidenotes.sidenotePadding + 1
					&& citationRect.bottom + (-1 * (sidenoteRect.top - Sidenotes.sidenotePadding)) < window.innerHeight)
					scrollElementIntoView(sidenote, {
						offset: (-1 * (Sidenotes.sidenotePadding + 1))
					});

				Sidenotes.unSlideLockSidenote(sidenote);
			});
		}

		/*	Hide mode selectors, as they would otherwise overlap a
			sidenote that’s on the top-right.
		 */
		if (Notes.noteNumberFromHash() > "")
			Sidenotes.hideInterferingUIElements();
	},

	/*  This function actually calculates and sets the positions of all sidenotes.
	 */
	updateSidenotePositions: () => {
		GWLog("Sidenotes.updateSidenotePositions", "sidenotes.js", 1);

		/*  If we’re in footnotes mode (ie. the viewport is too narrow), then
			don’t do anything.
		 */
		if (Sidenotes.mediaQueries.viewportWidthBreakpoint.matches == false)
			return;

		//	Update the disposition of sidenotes.
		Sidenotes.sidenotes.forEach(sidenote => {
			/*  Hide sidenotes within currently-collapsed collapse blocks. Show
				sidenotes not within currently-collapsed collapse blocks.
			 */
			let citation = Sidenotes.counterpart(sidenote);
			sidenote.classList.toggle("hidden", isWithinCollapsedBlock(citation));

			//  On which side should the sidenote go?
			let sidenoteNumber = Notes.noteNumber(sidenote);
			let side = null;
			       if (   Sidenotes.useLeftColumn()  == true
					   && Sidenotes.useRightColumn() == false) {
				//	Left.
				side = Sidenotes.sidenoteColumnLeft;
			} else if (   Sidenotes.useLeftColumn()  == false
					   && Sidenotes.useRightColumn() == true) {
				//	Right.
				side = Sidenotes.sidenoteColumnRight;
			} else if (   Sidenotes.useLeftColumn()  == true
					   && Sidenotes.useRightColumn() == true) {
				//	Odd - right; even - left.
				side = (sidenoteNumber % 2
						? Sidenotes.sidenoteColumnLeft
						: Sidenotes.sidenoteColumnRight);
			}

			//  Inject the sidenote into the column (provisionally).
			if (sidenote.classList.contains("hidden")) {
				Sidenotes.hiddenSidenoteStorage.append(sidenote);
			} else if (   sidenote.parentElement == Sidenotes.hiddenSidenoteStorage
					   || sidenote.parentElement == null) {
				side.append(sidenote);
			}
		});

		/*  Determine proscribed vertical ranges (ie. bands of the page from which
			sidenotes are excluded, by the presence of, eg. a full-width table).
		 */
		let leftColumnBoundingRect = Sidenotes.sidenoteColumnLeft.getBoundingClientRect();
		let rightColumnBoundingRect = Sidenotes.sidenoteColumnRight.getBoundingClientRect();

		/*  Examine all potentially overlapping elements (ie. non-sidenote
			elements that may appear in, or extend into, the side columns).
		 */
		let proscribedVerticalRangesLeft = [ ];
		let proscribedVerticalRangesRight = [ ];
		document.querySelectorAll(Sidenotes.potentiallyOverlappingElementsSelectors.join(", ")).forEach(potentiallyOverlappingElement => {
			if (isWithinCollapsedBlock(potentiallyOverlappingElement))
				return;

			let elementBoundingRect = potentiallyOverlappingElement.getBoundingClientRect();

			if (!(   elementBoundingRect.left > leftColumnBoundingRect.right
				  || elementBoundingRect.right < leftColumnBoundingRect.left))
				proscribedVerticalRangesLeft.push({ top: (elementBoundingRect.top - Sidenotes.sidenoteSpacing) - leftColumnBoundingRect.top,
													bottom: (elementBoundingRect.bottom + Sidenotes.sidenoteSpacing) - leftColumnBoundingRect.top,
													element: potentiallyOverlappingElement });

			if (!(   elementBoundingRect.left > rightColumnBoundingRect.right
				  || elementBoundingRect.right < rightColumnBoundingRect.left))
				proscribedVerticalRangesRight.push({ top: (elementBoundingRect.top - Sidenotes.sidenoteSpacing) - rightColumnBoundingRect.top,
													 bottom: (elementBoundingRect.bottom + Sidenotes.sidenoteSpacing) - rightColumnBoundingRect.top,
													 element: potentiallyOverlappingElement });
		});

		//  The bottom edges of each column are also “proscribed vertical ranges”.
		proscribedVerticalRangesLeft.push({
			top:    Sidenotes.sidenoteColumnLeft.clientHeight,
			bottom: Sidenotes.sidenoteColumnLeft.clientHeight
		});
		proscribedVerticalRangesRight.push({
			top:    Sidenotes.sidenoteColumnRight.clientHeight,
			bottom: Sidenotes.sidenoteColumnRight.clientHeight
		});

		//	Sort and merge.
		[ proscribedVerticalRangesLeft, proscribedVerticalRangesRight ].forEach(ranges => {
			ranges.sort((rangeA, rangeB) => {
				return (rangeA.top - rangeB.top);
			});

			for (let i = 0; i < ranges.length - 1; i++) {
				let thisRange = ranges[i];
				let nextRange = ranges[i + 1];

				if (nextRange.top <= thisRange.bottom) {
					thisRange.bottom = nextRange.bottom;
					ranges.splice(i + 1, 1);
					i++;
				}
			}
		});

		//	Store their layout heights of sidenotes.
		Sidenotes.sidenotes.forEach(sidenote => {
			//  Mark sidenotes which are cut off vertically.
			let sidenoteOuterWrapper = sidenote.firstElementChild;
			sidenote.classList.toggle("cut-off", (sidenoteOuterWrapper.scrollHeight > sidenoteOuterWrapper.offsetHeight + 2));

			//	Store layout height.
			sidenote.lastKnownHeight = sidenote.offsetHeight;
		});

		//	Clean up old layout cells, if any.
		[ Sidenotes.sidenoteColumnLeft, Sidenotes.sidenoteColumnRight ].forEach(column => {
			column.querySelectorAll(".sidenote-layout-cell").forEach(cell => cell.remove());
		});

		//	Construct new layout cells.
		let layoutCells = [ ];
		let sides = [ ];
		if (Sidenotes.useLeftColumn())
			sides.push([ Sidenotes.sidenoteColumnLeft, leftColumnBoundingRect, proscribedVerticalRangesLeft ]);
		if (Sidenotes.useRightColumn())
			sides.push([ Sidenotes.sidenoteColumnRight, rightColumnBoundingRect, proscribedVerticalRangesRight ]);
		sides.forEach(side => {
			let [ column, rect, ranges ] = side;
			let prevRangeBottom = 0;

			ranges.forEach(range => {
				let cell = newElement("DIV", {
					"class": "sidenote-layout-cell"
				}, {
					"sidenotes": [ ],
					"container": column,
					"room": (range.top - prevRangeBottom),
					"style": `top: ${prevRangeBottom + "px"}; height: ${(range.top - prevRangeBottom) + "px"}`
				});

				column.append(cell);
				cell.rect = cell.getBoundingClientRect();
				layoutCells.push(cell);

				prevRangeBottom = range.bottom;
			});
		});

		/*	Default position for a sidenote within a layout cell is vertically
			aligned with the footnote reference, or else at the top of the
			cell, whichever is lower.
		 */
		let defaultNotePosInCellForCitation = (cell, citation) => {
			return Math.max(0, Math.round((citation.getBoundingClientRect().top - cell.rect.top) + 4));
		};

		//	Assign sidenotes to layout cells.
		for (citation of Sidenotes.citations) {
			let sidenote = Sidenotes.counterpart(citation);

			/*  Is this sidenote even displayed? Or is it hidden (i.e., its
				citation is within a currently-collapsed collapse block)?
				If so, skip it.
			 */
			if (sidenote.classList.contains("hidden"))
				continue;

			//	Get all the cells that the sidenote can fit into.
			let fittingLayoutCells = layoutCells.filter(cell => cell.room >= sidenote.lastKnownHeight);
			if (fittingLayoutCells.length == 0) {
				GWLog("TOO MUCH SIDENOTES. GIVING UP. :(", "sidenotes.js");
				Sidenotes.sidenotes.forEach(sidenote => {
					sidenote.remove();
				});
				return;
			}

			/*	These functions are used to sort layout cells by best fit for
				placing the current sidenote.
			 */
			let citationBoundingRect = citation.getBoundingClientRect();
			let vDistanceToCell = (cell) => {
				if (   citationBoundingRect.top > cell.rect.top
					&& citationBoundingRect.top < cell.rect.bottom)
					return 0;
				return (citationBoundingRect.top < cell.rect.top
						? Math.abs(citationBoundingRect.top - cell.rect.top)
						: Math.abs(citationBoundingRect.top - cell.rect.bottom));
			};
			let hDistanceToCell = (cell) => {
				return Math.abs(citationBoundingRect.left - (cell.left + (cell.width / 2)));
			};
			let overlapWithNote = (cell, note) => {
				let notePosInCell = defaultNotePosInCellForCitation(cell, citation);

				let otherNoteCitation = Sidenotes.counterpart(note);
				let otherNotePosInCell = defaultNotePosInCellForCitation(cell, otherNoteCitation);

				return (   otherNotePosInCell > notePosInCell + sidenote.lastKnownHeight + Sidenotes.sidenoteSpacing
						|| notePosInCell      > otherNotePosInCell + note.lastKnownHeight + Sidenotes.sidenoteSpacing)
					   ? 0
					   : Math.max(notePosInCell + sidenote.lastKnownHeight + Sidenotes.sidenoteSpacing - otherNotePosInCell,
					   			  otherNotePosInCell + note.lastKnownHeight + Sidenotes.sidenoteSpacing - notePosInCell);
			};
			let cellCrowdedness = (cell) => {
				return cell.sidenotes.reduce((totalOverlap, note) => { return (totalOverlap + overlapWithNote(cell, note)); }, 0);
			};

			/*	We sort the fitting cells by vertical distance from the sidenote
				and crowdedness at the sidenote’s default location within the
				cell, and secondarily by horizontal distance from the sidenote.
			 */
			fittingLayoutCells.sort((cellA, cellB) => {
				return (   (  (vDistanceToCell(cellA) + cellCrowdedness(cellA))
							- (vDistanceToCell(cellB) + cellCrowdedness(cellB)))
						|| (hDistanceToCell(cellA) - hDistanceToCell(cellB)));
			});
			let closestFittingLayoutCell = fittingLayoutCells[0];

			//	Add the sidenote to the selected cell.
			closestFittingLayoutCell.room -= (sidenote.lastKnownHeight + Sidenotes.sidenoteSpacing);
			closestFittingLayoutCell.sidenotes.push(sidenote);
		};

		//	Function to compute distance between two successive sidenotes.
		let getDistance = (noteA, noteB) => {
			return (noteB.posInCell - (noteA.posInCell + noteA.lastKnownHeight + Sidenotes.sidenoteSpacing));
		};

		//	Position sidenotes within layout cells.
		layoutCells.forEach(cell => {
			if (cell.sidenotes.length == 0)
				return;

			//	Set all of the cell’s sidenotes to default positions.
			cell.sidenotes.forEach(sidenote => {
				let citation = Sidenotes.counterpart(sidenote);
				sidenote.posInCell = defaultNotePosInCellForCitation(cell, citation);
			});

			//	Sort the cell’s sidenotes vertically (secondarily by number).
			cell.sidenotes.sort((noteA, noteB) => {
				return (   (noteA.posInCell - noteB.posInCell)
						|| (parseInt(noteA.id.substr(2)) - parseInt(noteB.id.substr(2))));
			});

			//	Called in pushNotesUp().
			let shiftNotesUp = (noteIndexes, shiftUpDistance) => {
				noteIndexes.forEach(idx => {
					cell.sidenotes[idx].posInCell -= shiftUpDistance;
				});
			};

			//	Called immediately below.
			let pushNotesUp = (pushUpWhich, pushUpForce, bruteStrength = false) => {
				let roomToPush = pushUpWhich.first == 0
								 ? cell.sidenotes[pushUpWhich.first].posInCell
								 : Math.max(0, getDistance(cell.sidenotes[pushUpWhich.first - 1], cell.sidenotes[pushUpWhich.first]));

				let pushUpDistance = bruteStrength
									 ? pushUpForce
									 : Math.floor(pushUpForce / pushUpWhich.length);
				if (pushUpDistance <= roomToPush) {
					shiftNotesUp(pushUpWhich, pushUpDistance);
					return (pushUpForce - pushUpDistance);
				} else {
					shiftNotesUp(pushUpWhich, roomToPush);
					if (pushUpWhich.first == 0)
						return (pushUpForce - roomToPush);

					pushUpWhich.splice(0, 0, pushUpWhich.first - 1);
					return pushNotesUp(pushUpWhich, (pushUpForce - roomToPush), bruteStrength);
				}
			};

			/*	Check each sidenote after the first for overlap with the one
				above it; if it overlaps, try pushing the sidenote(s) above it
				upward, and also shift the note itself downward.
			 */
			for (let i = 1; i < cell.sidenotes.length; i++) {
				let prevNote = cell.sidenotes[i - 1];
				let thisNote = cell.sidenotes[i];
				let nextNote = (i == cell.sidenotes.length - 1)
							   ? null
							   : cell.sidenotes[i + 1];

				let overlapAbove = Math.max(0, (-1 * getDistance(prevNote, thisNote)));
				if (overlapAbove == 0)
					continue;

				let pushUpForce = Math.round(overlapAbove / 2);
				thisNote.posInCell += ((overlapAbove - pushUpForce) + pushNotesUp([ (i - 1) ], pushUpForce));
			}

			/*	Check whether the lowest sidenote overlaps the cell’s bottom;
				if so, push it (and any sidenotes above it that it bumps into)
				upward.
			 */
			let overlapOfBottom = Math.max(0, (cell.sidenotes.last.posInCell + cell.sidenotes.last.lastKnownHeight) - parseInt(cell.style.height));
			if (overlapOfBottom > 0)
				pushNotesUp([ (cell.sidenotes.length - 1) ], overlapOfBottom, true);

			//	Set the sidenote positions via inline styles.
			cell.sidenotes.forEach(sidenote => {
				sidenote.style.top = Math.round(sidenote.posInCell) + "px";
			});

			//	Re-inject the sidenotes into the page.
			cell.append(...cell.sidenotes);
		});

		//  Un-hide the sidenote columns.
		Sidenotes.sidenoteColumnLeft.style.visibility = "";
		Sidenotes.sidenoteColumnRight.style.visibility = "";

		//	Fire event.
		GW.notificationCenter.fireEvent("Sidenotes.sidenotePositionsDidUpdate");
	},

	/*  Destroys the HTML structure of the sidenotes.
	 */
	deconstructSidenotes: () => {
		GWLog("Sidenotes.deconstructSidenotes", "sidenotes.js", 1);

		Sidenotes.sidenotes = null;
		Sidenotes.citations = null;

		if (Sidenotes.sidenoteColumnLeft)
			Sidenotes.sidenoteColumnLeft.remove();
		Sidenotes.sidenoteColumnLeft = null;

		if (Sidenotes.sidenoteColumnRight)
			Sidenotes.sidenoteColumnRight.remove();
		Sidenotes.sidenoteColumnRight = null;

		if (Sidenotes.hiddenSidenoteStorage)
			Sidenotes.hiddenSidenoteStorage.remove();
		Sidenotes.hiddenSidenoteStorage = null;
	},

	/*  Constructs the HTML structure, and associated listeners and auxiliaries,
		of the sidenotes.
	 */
	constructSidenotes: (injectEventInfo) => {
		GWLog("Sidenotes.constructSidenotes", "sidenotes.js", 1);

		//	Ensure that infrastructure is constructed if need be.
		if (Sidenotes.hiddenSidenoteStorage == null) {
			let markdownBody = document.querySelector("#markdownBody");

			//  Add the sidenote columns.
			Sidenotes.sidenoteColumnLeft = newElement("DIV", { "id": "sidenote-column-left" });
			Sidenotes.sidenoteColumnRight = newElement("DIV", { "id": "sidenote-column-right" });
			[ Sidenotes.sidenoteColumnLeft, Sidenotes.sidenoteColumnRight ].forEach(column => {
				column.classList.add("footnotes", "sidenote-column");
				column.style.visibility = "hidden";
				markdownBody.append(column);
			});

			//	Add the hidden sidenote storage.
			markdownBody.append(Sidenotes.hiddenSidenoteStorage = newElement("DIV", {
				"id": "hidden-sidenote-storage",
				"class": "footnotes",
				"style": "display:none"
			}));

			Sidenotes.sidenotes = [ ];
			Sidenotes.citations = [ ];
		}

		let modifiedFootnote = injectEventInfo.container.closest("li.footnote");
		if (modifiedFootnote) {
			let noteNumber = Notes.noteNumber(modifiedFootnote);

			let sidenote = Sidenotes.sidenoteOfNumber(noteNumber);
			if (sidenote == null)
				return;

			let citation = Sidenotes.citationOfNumber(noteNumber);

			//	Inject the sidenote contents into the sidenote.
			let includeLink = synthesizeIncludeLink(citation, {
				"class": "include-strict include-unwrap",
				"data-include-selector-not": ".footnote-self-link"
			});
			includeLink.hash = "#" + Notes.footnoteIdForNumber(noteNumber);
			sidenote.querySelector(".sidenote-inner-wrapper").replaceChildren(includeLink);

			//	Trigger transclude.
			Transclude.triggerTransclude(includeLink, {
				container: sidenote,
				document: document,
				source: "Sidenotes.constructSidenotes"
			});

			//	Fire event.
			GW.notificationCenter.fireEvent("Sidenotes.sidenotesDidConstruct");

			return;
		}

		/*	Get citations in the newly injected content. (Skip citations of a
			number matching existing citations; also, deduplicate, keeping only
			the first instance of multiple citations with the same number.)
		 */
		let newCitations = Array.from(injectEventInfo.container.querySelectorAll("a.footnote-ref")).filter(citation => {
			return (Sidenotes.citationOfNumber(Notes.noteNumber(citation)) == null);
		}).filter((citation, index, array) => {
			return (array.findIndex(otherCitation => (Notes.noteNumber(otherCitation) == Notes.noteNumber(citation))) == index);
		});
		if (newCitations.length == 0)
			return;

		//  The footnote references (citations).
		Sidenotes.citations.push(...newCitations);

		//  Create and inject the sidenotes.
		let newSidenotes = [ ];
		newCitations.forEach(citation => {
			let noteNumber = Notes.noteNumber(citation);

			//  Create the sidenote outer containing block...
			let sidenote = newElement("DIV", {
				class: "sidenote",
				id: Notes.sidenoteIdForNumber(noteNumber)
			});

			//  Wrap the contents of the footnote in two wrapper divs...
			sidenote.appendChild(sidenote.outerWrapper = newElement("DIV", {
				class: "sidenote-outer-wrapper"
			})).appendChild(sidenote.innerWrapper = newElement("DIV", {
				class: "sidenote-inner-wrapper"
			}));

			/*  Create & inject the sidenote self-link (ie. boxed sidenote
				number).
			 */
			sidenote.append(newElement("A", {
				"class": "sidenote-self-link",
				"href": "#" + Notes.sidenoteIdForNumber(noteNumber)
			}, {
				"textContent": noteNumber
			}));

			//	Inject the sidenote contents into the sidenote.
			let includeLink = synthesizeIncludeLink(citation, {
				"class": "include-strict include-unwrap",
				"data-include-selector-not": ".footnote-self-link"
			});
			includeLink.hash = "#" + Notes.footnoteIdForNumber(noteNumber);
			includeLink.dataset.pageSectionId = "footnotes";
			sidenote.querySelector(".sidenote-inner-wrapper").append(includeLink);

			//  Add the sidenote to the sidenotes array...
			Sidenotes.sidenotes.push(sidenote);

			//	Track newly added sidenotes.
			newSidenotes.push(sidenote);
		});

		//	Inject the sidenotes into the page.
		Sidenotes.hiddenSidenoteStorage.append(...newSidenotes);

		/*  Bind sidenote mouse-hover events.
		 */
		newCitations.forEach(citation => {
			let sidenote = Sidenotes.counterpart(citation);

			//	Unbind existing events, if any.
			if (sidenote.onSidenoteMouseEnterHighlightCitation)
				sidenote.removeEventListener("mouseenter", sidenote.onSidenoteMouseEnterHighlightCitation);
			if (sidenote.onSidenoteMouseLeaveUnhighlightCitation)
				sidenote.removeEventListener("mouseleave", sidenote.onSidenoteMouseLeaveUnhighlightCitation);

			if (citation.onCitationMouseEnterSlideSidenote)
				citation.removeEventListener("mouseenter", citation.onCitationMouseEnterSlideSidenote);
			if (sidenote.onSidenoteMouseEnterSlideSidenote)
				sidenote.removeEventListener("mouseenter", sidenote.onSidenoteMouseEnterSlideSidenote);
			if (sidenote.onSidenoteMouseLeaveUnslideSidenote)
				sidenote.removeEventListener("mouseleave", sidenote.onSidenoteMouseLeaveUnslideSidenote);

			if (sidenote.scrollListener)
				sidenote.outerWrapper.removeEventListener("scroll", sidenote.scrollListener);

			//	Bind new events.
			sidenote.addEventListener("mouseenter", sidenote.onSidenoteMouseEnterHighlightCitation = (event) => {
				citation.classList.toggle("highlighted", true);
				sidenote.classList.toggle("hovering", true);
			});
			sidenote.addEventListener("mouseleave", sidenote.onSidenoteMouseLeaveUnhighlightCitation = (event) => {
				citation.classList.toggle("highlighted", false);
				sidenote.classList.toggle("hovering", false);
			});

			citation.addEventListener("mouseenter", citation.onCitationMouseEnterSlideSidenote = (event) => {
				Sidenotes.putAllSidenotesBack(sidenote);
				requestAnimationFrame(() => {
					Sidenotes.slideSidenoteIntoView(sidenote, true);
				});
			});
			sidenote.addEventListener("mouseenter", sidenote.onSidenoteMouseEnterSlideSidenote = (event) => {
				Sidenotes.putAllSidenotesBack(sidenote);
				requestAnimationFrame(() => {
					Sidenotes.slideSidenoteIntoView(sidenote, false);
				});
			});
			sidenote.addEventListener("mouseleave", sidenote.onSidenoteMouseLeaveUnslideSidenote = (event) => {
				Sidenotes.putSidenoteBack(sidenote);
			});

			sidenote.scrollListener = addScrollListener(sidenote.onSidenoteScrollToggleHideMoreIndicator = (event) => {
				sidenote.classList.toggle("hide-more-indicator", sidenote.outerWrapper.scrollTop + sidenote.outerWrapper.clientHeight == sidenote.outerWrapper.scrollHeight);
			}, {
				target: sidenote.outerWrapper
			});
		});

		//	Trigger transcludes.
		Transclude.triggerTranscludesInContainer(Sidenotes.hiddenSidenoteStorage, {
			container: Sidenotes.hiddenSidenoteStorage,
			document: document,
			source: "Sidenotes.constructSidenotes"
		});

		//	Fire event.
		GW.notificationCenter.fireEvent("Sidenotes.sidenotesDidConstruct");
	},

	cleanup: () => {
		GWLog("Sidenotes.cleanup", "sidenotes.js", 1);

		/*	Deactivate active media queries.
		 */
		cancelDoWhenMatchMedia("Sidenotes.rewriteHashForCurrentMode");
		cancelDoWhenMatchMedia("Sidenotes.updateMarginNoteStyleForCurrentMode");
		cancelDoWhenMatchMedia("Sidenotes.rewriteCitationTargetsForCurrentMode");
		cancelDoWhenMatchMedia("Sidenotes.addOrRemoveEventHandlersForCurrentMode");

		/*	Remove sidenotes & auxiliaries from HTML.
		 */
		Sidenotes.deconstructSidenotes(true);

		GW.notificationCenter.fireEvent("Sidenotes.cleanupDidComplete");
	},

	/*  Q:  Why is this setup function so long and complex?
		A:  In order to properly handle all of the following:

		1.  The two different modes (footnote popups vs. sidenotes)
		2.  The interactions between sidenotes and collapse blocks
		3.  Linking to footnotes/sidenotes
		4.  Loading a URL that links to a footnote/sidenote
		5.  Changes in the viewport width dynamically altering all of the above

		… and, of course, correct layout of the sidenotes, even in tricky cases
		where the citations are densely packed and the sidenotes are long.
	 */
	setup: () => {
		GWLog("Sidenotes.setup", "sidenotes.js", 1);

		/*  If the page was loaded with a hash that points to a footnote, but
			sidenotes are enabled (or vice-versa), rewrite the hash in
			accordance with the current mode (this will also cause the page to
			end up scrolled to the appropriate element - footnote or sidenote).
			Add an active media query to rewrite the hash whenever the viewport
			width media query changes.
		 */
		doWhenMatchMedia(Sidenotes.mediaQueries.viewportWidthBreakpoint, "Sidenotes.rewriteHashForCurrentMode", (mediaQuery) => {
			if (   Notes.hashMatchesFootnote()
				|| Notes.hashMatchesSidenote()) {
				relocate("#" + (mediaQuery.matches 
								? Notes.sidenoteIdForNumber(Notes.noteNumberFromHash()) 
								: Notes.footnoteIdForNumber(Notes.noteNumberFromHash())));

				//	Update targeting.
				if (mediaQuery.matches)
					Sidenotes.updateTargetCounterpart();
				else
					updateFootnoteTargeting();
			}
		}, null, (mediaQuery) => {
			if (Notes.hashMatchesSidenote()) {
				relocate("#" + Notes.footnoteIdForNumber(Notes.noteNumberFromHash()));

				//	Update targeting.
				updateFootnoteTargeting();
			}
		});

		/*	We do not bother to construct sidenotes on mobile clients, and so
			the rest of this is also irrelevant.
		 */
		if (GW.isMobile())
			return;

		/*	Add event handler to update margin note style in transcluded content
			and pop-frames.
		 */
		addContentInjectHandler(GW.contentInjectHandlers.setMarginNoteStyle = (eventInfo) => {
			GWLog("setMarginNoteStyle", "sidenotes.js", 1);

			/*	Set margin notes to ‘inline’ or ‘sidenote’ style, depending on 
				what mode the page is in (based on viewport width), whether each
				margin note is in a constrained block, and whether it’s on the 
				main page or in something like a pop-frame.
			 */
			eventInfo.container.querySelectorAll(".marginnote").forEach(marginNote => {
				let inline = (   marginNote.closest(Sidenotes.constrainMarginNotesWithinSelectors.join(", "))
							  || Sidenotes.mediaQueries.marginNoteViewportWidthBreakpoint.matches == false
							  || eventInfo.document != document);
				marginNote.swapClasses([ "inline", "sidenote" ], (inline ? 0 : 1));
			});
		}, ">rewrite");

		/*	When the main content loads, update the margin note style; and add 
			event listener to re-update it when the viewport width changes.
		 */
		addContentLoadHandler(GW.contentLoadHandlers.addUpdateMarginNoteStyleForCurrentModeActiveMediaQuery = (eventInfo) => {
			GWLog("addUpdateMarginNoteStyleForCurrentModeActiveMediaQuery", "sidenotes.js", 1);

			doWhenMatchMedia(Sidenotes.mediaQueries.marginNoteViewportWidthBreakpoint, "Sidenotes.updateMarginNoteStyleForCurrentMode", (mediaQuery) => {
				GW.contentInjectHandlers.setMarginNoteStyle(eventInfo);
			});
		}, "rewrite", (info) => info.container == document.main, true);

		/*	When an anchor link is clicked that sets the hash to its existing
			value, weird things happen. In particular, weird things happen with
			citations and sidenotes. We must prevent that, by updating state
			properly when that happens. (No ‘hashchange’ event is fired in this
			case, so we cannot depend on the ‘GW.hashDidChange’ event handler.)
		 */
		addContentInjectHandler(Sidenotes.addFauxHashChangeEventsToNoteMetaLinks = (eventInfo) => {
			GWLog("addFauxHashChangeEventsToNoteMetaLinks", "sidenotes.js", 1);

			let selector = [
				"a.footnote-ref",
				"a.sidenote-self-link",
				".sidenote a.footnote-back"
			].join(", ");

			eventInfo.container.querySelectorAll(selector).forEach(link => {
				link.addActivateEvent((event) => {
					if (link.hash == location.hash)
						Sidenotes.updateStateAfterHashChange();
				});
			});
		}, "eventListeners", (info) => info.document == document);

		/*  In footnote mode (ie. on viewports too narrow to support sidenotes),
			footnote reference links (i.e., citations) should point down to
			footnotes (this is the default state). But in sidenote mode,
			footnote reference links should point to sidenotes.

			We therefore rewrite all footnote reference links appropriately to
			the current mode (based on viewport width).

			We also add an active media query to rewrite the links if a change
			in viewport width results in switching modes, as well as an event
			handler to rewrite footnote reference links in transcluded content.
		 */
		doWhenMatchMedia(Sidenotes.mediaQueries.viewportWidthBreakpoint, "Sidenotes.rewriteCitationTargetsForCurrentMode", (mediaQuery) => {
			document.querySelectorAll("a.footnote-ref").forEach(citation => {
				if (citation.pathname == location.pathname)
					citation.hash = "#" + (mediaQuery.matches 
										   ? Notes.sidenoteIdForNumber(Notes.noteNumber(citation))
										   : Notes.footnoteIdForNumber(Notes.noteNumber(citation)));
			});
		}, null, (mediaQuery) => {
			document.querySelectorAll("a.footnote-ref").forEach(citation => {
				if (citation.pathname == location.pathname)
					citation.hash = "#" + Notes.footnoteIdForNumber(Notes.noteNumber(citation));
			});
		});

		addContentLoadHandler(Sidenotes.rewriteCitationTargetsInLoadedContent = (eventInfo) => {
			GWLog("rewriteCitationTargetsInLoadedContent", "sidenotes.js", 1);

			document.querySelectorAll("a.footnote-ref").forEach(citation => {
				if (citation.pathname == location.pathname)
					citation.hash = "#" + (Sidenotes.mediaQueries.viewportWidthBreakpoint.matches 
										   ? Notes.sidenoteIdForNumber(Notes.noteNumber(citation))
										   : Notes.footnoteIdForNumber(Notes.noteNumber(citation)));
			});
		}, "rewrite", (info) => info.document == document);

		/*	What happens if the page loads with a URL hash that points to a
			sidenote or footnote or citation? We need to scroll appropriately,
			and do other adjustments, just as we do when the hash updates.
		 */
		GW.notificationCenter.addHandlerForEvent("Sidenotes.sidenotesDidConstruct", Sidenotes.updateHashTargetedElementStateAfterSidenotesDidConstruct = (eventInfo) => {
			GW.notificationCenter.addHandlerForEvent("Sidenotes.sidenotePositionsDidUpdate", (eventInfo) => {
				Sidenotes.updateStateAfterHashChange();
			}, { once: true });
		});

		//	Add listener to update sidenote positions when media loads.
		addContentInjectHandler(GW.contentInjectHandlers.addMediaElementLoadEventsInSidenotes = (eventInfo) => {
			GWLog("addMediaElementLoadEventsInSidenotes", "sidenotes.js", 1);

			eventInfo.container.querySelectorAll("figure img, figure video").forEach(mediaElement => {
				mediaElement.addEventListener("load", (event) => {
					doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
				}, { once: true });
			});
		}, "eventListeners", (info) => (info.container.closest(".sidenote") != null));

		//	Add event listeners, and the switch between modes.
		doWhenMatchMedia(Sidenotes.mediaQueries.viewportWidthBreakpoint, "Sidenotes.addOrRemoveEventHandlersForCurrentMode", (mediaQuery) => {
			doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);

			/*  After the hash updates, properly highlight everything, if needed.
				Also, if the hash points to a sidenote whose citation is in a
				collapse block, expand it and all collapse blocks enclosing it.
			 */
			GW.notificationCenter.addHandlerForEvent("GW.hashDidChange", Sidenotes.updateStateAfterHashChange);

			/*	Add event handler to (asynchronously) recompute sidenote positioning
				when full-width media lazy-loads.
			 */
			GW.notificationCenter.addHandlerForEvent("Rewrite.fullWidthMediaDidLoad", Sidenotes.updateSidenotePositionsAfterFullWidthMediaDidLoad = (eventInfo) => {
				if (isWithinCollapsedBlock(eventInfo.mediaElement))
					return;

				doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
			});

			/*	Add event handler to (asynchronously) recompute sidenote positioning
				when collapse blocks are expanded/collapsed.
			 */
			GW.notificationCenter.addHandlerForEvent("Collapse.collapseStateDidChange", Sidenotes.updateSidenotePositionsAfterCollapseStateDidChange = (eventInfo) => {
				let sidenote = eventInfo.collapseBlock.closest(".sidenote");
				if (sidenote?.classList.contains("hovering")) {
					sidenote.addEventListener("mouseleave", (event) => {
						doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
					}, { once: true });
				} else {
					doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
				}
			}, {
				condition: (info) => (info.collapseBlock.closest("#markdownBody") != null)
			});

			/*	Add event handler to (asynchronously) recompute sidenote positioning
				when new content is loaded (e.g. via transclusion).
			 */
			GW.notificationCenter.addHandlerForEvent("Rewrite.contentDidChange", Sidenotes.updateSidenotePositionsAfterContentDidChange = (eventInfo) => {
				let sidenote = eventInfo.where.closest(".sidenote");
				if (sidenote?.classList.contains("hovering")) {
					sidenote.addEventListener("mouseleave", (event) => {
						doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
					}, { once: true });
				} else {
					doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
				}
			}, {
				condition: (info) => (   info.document == document
									  && info.source == "transclude")
			});

			/*  Add a resize listener so that sidenote positions are recalculated when
				the window is resized.
			 */
			addWindowResizeListener(Sidenotes.windowResized = (event) => {
				GWLog("Sidenotes.windowResized", "sidenotes.js", 3);

				doWhenPageLayoutComplete(Sidenotes.updateSidenotePositionsIfNeeded);
			}, {
				name: "Sidenotes.updateSidenotePositionsOnWindowResizeListener"
			});

			/*	Add handler to bind more sidenote-slide events if more
				citations are injected (e.g., in a popup).
			 */
			addContentInjectHandler(Sidenotes.bindAdditionalSidenoteSlideEvents = (eventInfo) => {
				GWLog("bindAdditionalSidenoteSlideEvents", "sidenotes.js", 3);

				eventInfo.container.querySelectorAll("a.footnote-ref").forEach(citation => {
					let sidenote = Sidenotes.counterpart(citation);
					if (sidenote == null)
						return;

					citation.addEventListener("mouseenter", citation.onCitationMouseEnterSlideSidenote = (event) => {
						Sidenotes.putAllSidenotesBack(sidenote);
						requestAnimationFrame(() => {
							Sidenotes.slideSidenoteIntoView(sidenote, true);
						});
					});
				});
			}, "eventListeners", (info) => info.document != document);

			/*	Add a scroll listener to un-slide all sidenotes on scroll.
			 */
			addScrollListener((event) => {
				Sidenotes.putAllSidenotesBack();
			}, {
				name: "Sidenotes.unSlideSidenotesOnScrollListener",
				defer: true
			});
		}, (mediaQuery) => {
			/*	Deactivate event handlers.
			 */
			GW.notificationCenter.removeHandlerForEvent("GW.hashDidChange", Sidenotes.updateStateAfterHashChange);
			GW.notificationCenter.removeHandlerForEvent("Rewrite.contentDidChange", Sidenotes.updateSidenotePositionsAfterContentDidChange);
			GW.notificationCenter.removeHandlerForEvent("Rewrite.fullWidthMediaDidLoad", Sidenotes.updateSidenotePositionsAfterFullWidthMediaDidLoad);
			GW.notificationCenter.removeHandlerForEvent("Collapse.collapseStateDidChange", Sidenotes.updateSidenotePositionsAfterCollapseStateDidChange);
			GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", Sidenotes.bindAdditionalSidenoteSlideEvents);
			removeScrollListener("Sidenotes.unSlideSidenotesOnScroll");
			removeWindowResizeListener("Sidenotes.recalculateSidenotePositionsOnWindowResize");
		}, (mediaQuery) => {
			/*	Deactivate event handlers.
			 */
			GW.notificationCenter.removeHandlerForEvent("GW.hashDidChange", Sidenotes.updateStateAfterHashChange);
			GW.notificationCenter.removeHandlerForEvent("Rewrite.contentDidChange", Sidenotes.updateSidenotePositionsAfterContentDidChange);
			GW.notificationCenter.removeHandlerForEvent("Rewrite.fullWidthMediaDidLoad", Sidenotes.updateSidenotePositionsAfterFullWidthMediaDidLoad);
			GW.notificationCenter.removeHandlerForEvent("Collapse.collapseStateDidChange", Sidenotes.updateSidenotePositionsAfterCollapseStateDidChange);
			GW.notificationCenter.removeHandlerForEvent("GW.contentDidInject", Sidenotes.bindAdditionalSidenoteSlideEvents);
			removeScrollListener("Sidenotes.unSlideSidenotesOnScroll");
			removeWindowResizeListener("Sidenotes.recalculateSidenotePositionsOnWindowResize");
		});

		//	Once the sidenotes are constructed, lay them out.
		GW.notificationCenter.addHandlerForEvent("Sidenotes.sidenotesDidConstruct", (eventInfo) => {
			//	Lay out sidenotes once page layout is complete.
			doWhenPageLayoutComplete(() => {
				Sidenotes.updateSidenotePositions();

				//	Add listener to lay out sidenotes when they are re-constructed.
				GW.notificationCenter.addHandlerForEvent("Sidenotes.sidenotesDidConstruct", (eventInfo) => {
					//	Update highlighted state of sidenote and citation, if need be.
					Sidenotes.updateTargetCounterpart();

					//	Update sidenote positions.
					Sidenotes.updateSidenotePositionsIfNeeded();
				});

				/*	Add listener to lay out sidenotes when additional layout is
					done in the main document.
				 */
				GW.notificationCenter.addHandlerForEvent("Layout.layoutProcessorDidComplete", (eventInfo) => {
					//	Update sidenote positions.
					Sidenotes.updateSidenotePositionsIfNeeded();
				}, {
					condition: (info) => (   info.processorName == "applyBlockSpacingInContainer"
										  && info.container == document.main
										  && info.blockContainer.closest(".sidenote-column") == null)
				});
			});
		}, { once: true });

		/*  Construct the sidenotes whenever content is injected into the main
			page (including the initial page load).
		 */
		addContentInjectHandler(GW.contentInjectHandlers.constructSidenotesWhenMainPageContentDidInject = (eventInfo) => {
			GWLog("constructSidenotesWhenMainPageContentDidInject", "sidenotes.js", 1);

			Sidenotes.constructSidenotes(eventInfo);
		}, "rewrite", (info) => (   info.document == document
								 && info.container.closest(".sidenote") == null
								 && (   (   info.localize == true
								 		 && info.container.querySelector("a.footnote-ref") != null)
								 	 || info.container.closest("li.footnote") != null)));

		//	Fire event.
		GW.notificationCenter.fireEvent("Sidenotes.setupDidComplete");
	},

	hideInterferingUIElements: () => {
		requestAnimationFrame(() => {
			setTimeout(() => {
				//	Page toolbar.
				GW.pageToolbar?.toggleCollapseState(true);
				GW.pageToolbar?.fade();

				//	Back-to-top link.
				GW.backToTop?.classList.toggle("hidden", true)
			}, 25);
		});
	},

	/**************/
	/*	Slidenotes.
	 */

	displacedSidenotes: [ ],

	/*	If the sidenote is offscreen, slide it onto the screen.
	 */
	slideSidenoteIntoView: (sidenote, toCitation) => {
		GWLog("Sidenotes.slideSidenoteIntoView", "sidenotes.js", 3);

		Sidenotes.hideInterferingUIElements();

		if (sidenote.style.transform == "none")
			return;

		let minDistanceFromScreenEdge = Sidenotes.sidenotePadding + 1.0;

		let sidenoteRect = sidenote.getBoundingClientRect();
		if (   sidenoteRect.top >= minDistanceFromScreenEdge
			&& sidenoteRect.bottom <= window.innerHeight - minDistanceFromScreenEdge)
			return;

		let newSidenoteTop = sidenoteRect.top;
		if (toCitation) {
			let citationRect = Sidenotes.counterpart(sidenote).getBoundingClientRect()

			//	Down to citation.
			newSidenoteTop = Math.max(sidenoteRect.top, minDistanceFromScreenEdge, citationRect.top);

			//	Up to citation.
			newSidenoteTop = Math.min(newSidenoteTop + sidenoteRect.height,
									  window.innerHeight - minDistanceFromScreenEdge,
									  citationRect.top + sidenoteRect.height)
						   - sidenoteRect.height;

			//	Down to viewport top.
			newSidenoteTop = Math.max(newSidenoteTop, minDistanceFromScreenEdge);
		} else {
			//	Down to viewport top.
			newSidenoteTop = Math.max(sidenoteRect.top, minDistanceFromScreenEdge);

			//	Up to viewport bottom.
			newSidenoteTop = Math.min(newSidenoteTop + sidenoteRect.height,
									  window.innerHeight - minDistanceFromScreenEdge)
						   - sidenoteRect.height;
		}

		let delta = Math.round(newSidenoteTop - sidenoteRect.top);
		if (delta) {
			sidenote.style.transform = `translateY(${delta}px)`;
			sidenote.classList.toggle("displaced", true);
			if (Sidenotes.displacedSidenotes.includes(sidenote) == false)
				Sidenotes.displacedSidenotes.push(sidenote);
		}
	},

	/*	Un-slide a slid-onto-the-screen sidenote.
	 */
	putSidenoteBack: (sidenote) => {
		GWLog("Sidenotes.putSidenoteBack", "sidenotes.js", 3);

		if (sidenote.style.transform == "none")
			return;

		sidenote.style.transform = "";
		sidenote.classList.toggle("displaced", false);
	},

	/*	Un-slide all sidenotes (possibly except one).
	 */
	putAllSidenotesBack: (exceptOne = null) => {
		GWLog("Sidenotes.putAllSidenotesBack", "sidenotes.js", 3);

		Sidenotes.displacedSidenotes.forEach(sidenote => {
			if (sidenote == exceptOne)
				return;

			Sidenotes.putSidenoteBack(sidenote);
		});
		Sidenotes.displacedSidenotes = exceptOne ? [ exceptOne ] : [ ];
	},

	/*	Instantly un-slide sidenote and make it un-slidable.
	 */
	slideLockSidenote: (sidenote) => {
		GWLog("Sidenotes.slideLockSidenote", "sidenotes.js", 3);

		sidenote.style.transition = "none";
		sidenote.style.transform = "none";
		sidenote.classList.toggle("displaced", false);
	},

	/*	Instantly un-slide sidenote and make it slidable.
	 */
	unSlideLockSidenote: (sidenote) => {
		GWLog("Sidenotes.unSlideLockSidenote", "sidenotes.js", 3);

		sidenote.style.transform = "";
		sidenote.style.transition = "";
		sidenote.classList.toggle("displaced", false);
	},
};

GW.notificationCenter.fireEvent("Sidenotes.didLoad");

//  LET... THERE... BE... SIDENOTES!!!
Sidenotes.setup();
/* Image-focus.js */
/* Written by Obormot, 15 February 2019 */
/* License: GPL (derivative work of https://www.pmwiki.org/wiki/Cookbook/ImgFocus ) */
/* Lightweight dependency-free JavaScript library for "click to focus/zoom" images in HTML web pages. Originally coded for Obormot.net / GreaterWrong.com. */

ImageFocus = {
	/****************/
	/* Configuration.
	 ****************/

	contentImagesSelector: [
		".markdownBody figure img"
	].join(", "),

	excludedContainerElementsSelector: [
		"a",
		"button",
		"figure.image-focus-not"
	].join(", "),

	imageGalleryInclusionTest: (image) => {
		return (   image.closest("#markdownBody") != null
				&& image.closest(".footnotes") == null
				&& image.classList.contains("page-thumbnail") == false);
	},

	shrinkRatio: 0.975,

	hideUITimerDuration: (GW.isMobile() ? 5000 : 3000),

	dropShadowFilterForImages: "drop-shadow(10px 10px 10px #000) drop-shadow(0 0 10px #444)",

	hoverCaptionWidth: 175,
	hoverCaptionHeight: 75,

	fullSizeImageLoadHoverDelay: 25,

	/*****************/
	/* Infrastructure.
	 *****************/

	imageFocusUIElementsSelector: [
		".slideshow-button",
		".help-overlay",
		".image-number",
		".caption"
	].join(", "),

	focusableImagesSelector: null,
	focusedImageSelector: null,
	galleryImagesSelector: null,

	hideUITimer: null,

	overlay: null,

	mouseLastMovedAt: 0,

	currentlyFocusedImage: null,
	
	imageInFocus: null,

	/************/
	/* Functions.
	 ************/

	setup: () => {
		GWLog("ImageFocus.setup", "image-focus.js", 1);

		//  Create the image focus overlay.
		ImageFocus.overlay = addUIElement(`<div id="image-focus-overlay">
			<div class="help-overlay">
				<p class="slideshow-help-text"><strong>Arrow keys:</strong> Next/previous image</p>
				<p><strong>Escape</strong> or <strong>click</strong>: Hide zoomed image</p>
				<p><strong>Space bar:</strong> Reset image size & position</p>
				<p><strong>Scroll</strong> to zoom in/out</p>
				<p>(When zoomed in, <strong>drag</strong> to pan;<br /><strong>double-click</strong> to reset size & position)</p>
			</div>
			<div class="image-number"></div>
			<div class="slideshow-buttons">
				<button type="button" class="slideshow-button previous" tabindex="-1" title="Previous image">
					${(GW.svg("chevron-left-solid"))}
				</button>
				<button type="button" class="slideshow-button next" tabindex="-1" title="Next image">
					${(GW.svg("chevron-right-solid"))}
				</button>
			</div>
			<div class="caption"></div>
			<div class="loading-spinner">
				${(GW.svg("circle-notch-light"))}
			</div>
		</div>`);

		//  On orientation change, reset the size & position.
		doWhenMatchMedia(GW.mediaQueries.portraitOrientation, "ImageFocus.resetFocusedImagePositionWhenOrientationChanges", (mediaQuery) => {
			requestAnimationFrame(ImageFocus.resetFocusedImagePosition);
		});

		//  Add click listeners to the buttons.
		ImageFocus.overlay.querySelectorAll(".slideshow-button").forEach(button => {
			button.addActivateEvent(ImageFocus.slideshowButtonClicked = (event) => {
				GWLog("ImageFocus.slideshowButtonClicked", "image-focus.js", 2);

				ImageFocus.focusNextImage(event.target.classList.contains("next"));
				ImageFocus.cancelImageFocusHideUITimer();
				event.target.blur();
			});
		});

		//	Add listeners to help overlay.
		let helpOverlay = ImageFocus.overlay.querySelector(".help-overlay");
		if (GW.isMobile()) {
			helpOverlay.addEventListener("click", (event) => {
				helpOverlay.classList.toggle("open");
			});
		} else {
			helpOverlay.addEventListener("mouseenter", (event) => {
				helpOverlay.classList.add("open");
			});
			helpOverlay.addEventListener("mouseleave", (event) => {
				helpOverlay.classList.remove("open");
			});
		}

		//  UI starts out hidden.
		ImageFocus.hideImageFocusUI();

		//	Selector-suffixing function.
		function suffixedSelector(selector, suffix) {
			return selector.split(", ").map(part => part + suffix).join(", ");
		}

		/*	Create auxiliary selectors by suffixing provided content images
			selector with appropriate classes.
		 */
		ImageFocus.focusableImagesSelector = suffixedSelector(ImageFocus.contentImagesSelector, ".focusable");
		ImageFocus.focusedImageSelector = suffixedSelector(ImageFocus.contentImagesSelector, ".focused");
		ImageFocus.galleryImagesSelector = suffixedSelector(ImageFocus.contentImagesSelector, ".gallery-image");

        //  Add handler to set up events for images in injected content.
        addContentInjectHandler(ImageFocus.processImagesOnContentInject = (eventInfo) => {
            GWLog("ImageFocus.processImagesOnContentInject", "image-focus.js", 2);

            ImageFocus.processImagesWithin(eventInfo.container);

			//	If this content is (or is being loaded into) the main page...
			if (eventInfo.document == document) {
				//  Count how many images there are in the page, and set the “… of X” label to that.
				ImageFocus.overlay.querySelector(".image-number").dataset.numberOfImages = document.querySelectorAll(ImageFocus.galleryImagesSelector).length;

				//  Accesskey-L starts the slideshow.
				(document.querySelector(ImageFocus.galleryImagesSelector)||{}).accessKey = "l";
			}

			//	Fire targets-processed event.
			GW.notificationCenter.fireEvent("ImageFocus.imagesDidProcessOnContentInject", {
				source: "ImageFocus.processImagesOnContentInject",
				container: eventInfo.container,
				document: eventInfo.document
			});
        }, "eventListeners");

		//	Add handler to focus image on hashchange event.
		GW.notificationCenter.addHandlerForEvent("GW.hashDidChange", (info) => {
			ImageFocus.focusImageSpecifiedByURL();
		});

        //  Fire setup-complete event.
		GW.notificationCenter.fireEvent("ImageFocus.setupDidComplete");
	},

	designateSmallImageIfNeeded: (image) => {
		let width = image.getAttribute("width");
		let height = image.getAttribute("height");
		if (   (   width  !== null
				&& height !== null)
			&& (   width  < ImageFocus.hoverCaptionWidth
				|| height < ImageFocus.hoverCaptionHeight))
			image.classList.add("small-image");
	},

	processImagesWithin: (container) => {
		GWLog("ImageFocus.processImagesWithin", "image-focus.js", 1);

		/*	Add ‘focusable’ class to all focusable images; add ‘gallery-image’
			class to all focusable images that are to be included in the main
			image gallery; add ‘small-image’ class to all images that are too
			small to show the usual “Click to enlarge” overlay.
		 */
		container.querySelectorAll(ImageFocus.contentImagesSelector).forEach(image => {
			if (image.closest(ImageFocus.excludedContainerElementsSelector))
				return;

			image.classList.add("focusable");

			if (ImageFocus.imageGalleryInclusionTest(image))
				image.classList.add("gallery-image");

			ImageFocus.designateSmallImageIfNeeded(image);
		});

		//  Add the listener to all focusable images.
		container.querySelectorAll(ImageFocus.focusableImagesSelector).forEach(image => {
			image.addEventListener("click", ImageFocus.imageClickedToFocus);
		});

		//	Add listeners to preload full-sized images.
		container.querySelectorAll(ImageFocus.focusableImagesSelector).forEach(image => {
			image.removeAnnotationLoadEvents = onEventAfterDelayDo(image, "mouseenter", ImageFocus.fullSizeImageLoadHoverDelay, (event) => {
				ImageFocus.preloadImage(image);
				image.removeAnnotationLoadEvents();
			}, {
				cancelOnEvents: [ "mouseleave" ]
			});
		});

		//  Wrap all focusable images in a span.
		container.querySelectorAll(ImageFocus.focusableImagesSelector).forEach(image => {
			wrapElement(image, "span.image-wrapper.focusable", {
				moveClasses: [ "small-image" ],
				useExistingWrapper: true
			});
		});
	},

	focusedImgSrcForImage: (image) => {
		let imageSrcURL = URLFromString(image.src);
		if (   imageSrcURL.hostname == "upload.wikimedia.org"
			&& imageSrcURL.pathname.includes("/thumb/")) {
			let parts = /(.+)thumb\/(.+)\/[^\/]+$/.exec(imageSrcURL.pathname);
			imageSrcURL.pathname = parts[1] + parts[2];
			return imageSrcURL.href;
		} else if (image.srcset > "") {
			return Array.from(image.srcset.matchAll(/(\S+?)\s+(\S+?)(,|$)/g)).sort((a, b) => {
				if (parseFloat(a[2]) < parseFloat(b[2]))
					return -1;
				if (parseFloat(a[2]) > parseFloat(b[2]))
					return 1;
				return 0;
			}).last[1];
		} else if (image.dataset.srcSizeFull > "") {
			return image.dataset.srcSizeFull;
		} else {
			return image.src;
		}
	},

	expectedDimensionsForImage: (image) => {
		let width = parseInt(image.getAttribute("data-image-width") ?? image.getAttribute("data-file-width") ?? image.getAttribute("width"));
		let height = parseInt(image.getAttribute("data-image-height") ?? image.getAttribute("data-file-height") ?? image.getAttribute("height"));
		return (width && height
				? { width: width, height: height }
				: null);
	},

	preloadImage: (image) => {
		doAjax({ location: ImageFocus.focusedImgSrcForImage(image) });
	},

	focusImage: (imageToFocus, scrollToImage = true) => {
		GWLog("ImageFocus.focusImage", "image-focus.js", 1);

		//	Show overlay.
		ImageFocus.enterImageFocus();

		//	Show UI.
		ImageFocus.unhideImageFocusUI();

		//	Unfocus currently focused image, if any.
		ImageFocus.unfocusImage();

		//	Focus new image.
		imageToFocus.classList.toggle("focused", true);

		/*	If the new image is part of the main image gallery (i.e., if we are
			in gallery mode, rather than single-image mode)...
		 */
		if (imageToFocus.classList.contains("gallery-image")) {
			//	Update slideshow state.
			let lastFocusedImage = document.querySelector("img.last-focused");
			if (lastFocusedImage) {
				lastFocusedImage.classList.remove("last-focused");
				lastFocusedImage.removeAttribute("accesskey");
			}

			//  Set state of next/previous buttons.
			let images = document.querySelectorAll(ImageFocus.galleryImagesSelector);
			let indexOfFocusedImage = ImageFocus.getIndexOfFocusedImage();
			ImageFocus.overlay.querySelector(".slideshow-button.previous").disabled = (indexOfFocusedImage == 0);
			ImageFocus.overlay.querySelector(".slideshow-button.next").disabled = (indexOfFocusedImage == images.length - 1);

			//  Set the image number.
			ImageFocus.overlay.querySelector(".image-number").textContent = (indexOfFocusedImage + 1);

			//  Replace the hash.
			if (!location.hash.startsWith("#if_slide_"))
				ImageFocus.savedHash = location.hash;
			relocate("#if_slide_" + (indexOfFocusedImage + 1));

			//	Also preload the next and previous images.
			if (indexOfFocusedImage > 0)
				ImageFocus.preloadImage(images[indexOfFocusedImage - 1]);
			if (indexOfFocusedImage < images.length - 1)
				ImageFocus.preloadImage(images[indexOfFocusedImage + 1]);
		}

		//	Save reference to newly focused image.
		ImageFocus.currentlyFocusedImage = imageToFocus;

		//	Scroll to focused image, if need be.
		if (scrollToImage)
			revealElement(ImageFocus.currentlyFocusedImage);

		//  Create the focused version of the image.

		let imageURL = URLFromString(ImageFocus.focusedImgSrcForImage(imageToFocus));
		if (imageURL.pathname.endsWith(".pdf")) {
			ImageFocus.imageInFocus = elementFromHTML(Content.objectHTMLForURL(imageURL));		
		} else {
			ImageFocus.imageInFocus = newElement("IMG", {
				src: ImageFocus.focusedImgSrcForImage(imageToFocus),
				loading: "eager",
				decoding: "sync",
				style: ("filter: " + imageToFocus.style.filter + " " + ImageFocus.dropShadowFilterForImages)
			});
		}
		ImageFocus.imageInFocus.classList.add("image-in-focus");

		//  Add the image to the overlay.
		ImageFocus.overlay.insertBefore(ImageFocus.imageInFocus, ImageFocus.overlay.querySelector(".loading-spinner"));

		//  Set image to default size and position.
		ImageFocus.resetFocusedImagePosition(true);

		//  If image is bigger than viewport, it’s draggable.
		ImageFocus.imageInFocus.addEventListener("mousedown", ImageFocus.imageMouseDown);

		//  If image is bigger than viewport, double-click resets size/position.
		ImageFocus.imageInFocus.addEventListener("dblclick", ImageFocus.doubleClick);

		/*  If this image is part of the main gallery, then mark the overlay as 
			being in slide show mode (to show buttons/count). Otherwise, the
			overlay should be in single-image mode.
		 */
		ImageFocus.overlay.classList.toggle("slideshow", imageToFocus.classList.contains("gallery-image"));

		//  Set the caption.
		ImageFocus.setImageFocusCaption();

		//	Fire event.
		GW.notificationCenter.fireEvent("ImageFocus.imageDidFocus", { image: imageToFocus });
	},

	resetFocusedImagePosition: (updateOnLoad = false) => {
		GWLog("ImageFocus.resetFocusedImagePosition", "image-focus.js", 2);

		if (ImageFocus.imageInFocus == null)
			return;

		//  Make sure that initially, the image fits into the viewport.
		let imageWidth, imageHeight;
		if ((URLFromString(ImageFocus.imageInFocus.src)).pathname.endsWith(".svg")) {
			//	Special handling for SVGs, which have no intrinsic size.
			if (ImageFocus.imageInFocus.dataset.aspectRatio > "") {
				ImageFocus.imageInFocus.style.aspectRatio = ImageFocus.imageInFocus.dataset.aspectRatio;

				let parts = ImageFocus.imageInFocus.dataset.aspectRatio.match(/([0-9]+) \/ ([0-9]+)/);
				let aspectRatio = parseInt(parts[1]) / parseInt(parts[2]);
				imageWidth = window.innerHeight * aspectRatio;
				imageHeight = window.innerHeight;
			} else {
				imageWidth = imageHeight = Math.min(window.innerWidth, window.innerHeight);
			}
		} else {
			//	Non-SVGs have intrinsic size.
			if (updateOnLoad) {
				//	Reset on load.
				ImageFocus.imageInFocus.classList.add("loading");
				ImageFocus.imageInFocus.addEventListener("load", (event) => {
					ImageFocus.imageInFocus.classList.remove("loading");
					ImageFocus.resetFocusedImagePosition();
				}, { once: true });
			}

			//	If the image hasn’t loaded yet, these will both be 0.
			imageWidth = ImageFocus.imageInFocus.naturalWidth ?? 0;
			imageHeight = ImageFocus.imageInFocus.naturalHeight ?? 0;

			/*	If we don’t have the image’s actual dimensions yet (because we
				are still waiting for it to load), we nevertheless try to size
				the image element according to what information we have about
				how big the image will be when it loads.
			 */
			if (imageWidth * imageHeight == 0) {
				let expectedDimensions = ImageFocus.expectedDimensionsForImage(ImageFocus.currentlyFocusedImage);
				if (expectedDimensions) {
					imageWidth = expectedDimensions.width;
					imageHeight = expectedDimensions.height;
				}
			}
		}

		//	If we have no size info at all (yet), we do nothing.
		if (imageWidth * imageHeight == 0)
			return;

		//	Constrain dimensions proportionally.
		let constrainedWidth = Math.min(imageWidth, window.innerWidth * ImageFocus.shrinkRatio);
		let widthShrinkRatio = constrainedWidth / imageWidth;
		let constrainedHeight = Math.min(imageHeight, window.innerHeight * ImageFocus.shrinkRatio);
		let heightShrinkRatio = constrainedHeight / imageHeight;
		let shrinkRatio = Math.min(widthShrinkRatio, heightShrinkRatio);

		//	Set dimensions via CSS.
		ImageFocus.imageInFocus.style.width = Math.round(imageWidth * shrinkRatio) + "px";
		ImageFocus.imageInFocus.style.height = Math.round(imageHeight * shrinkRatio) + "px";
		ImageFocus.imageInFocus.style.aspectRatio = "" + Math.round(imageWidth * shrinkRatio) 
													   + " / " 
													   + Math.round(imageHeight * shrinkRatio);

		//  Remove modifications to position.
		ImageFocus.imageInFocus.style.left = "";
		ImageFocus.imageInFocus.style.top = "";

		//  Set the cursor appropriately.
		ImageFocus.setFocusedImageCursor();
	},

	setFocusedImageCursor: () => {
		GWLog("ImageFocus.setFocusedImageCursor", "image-focus.js", 2);

		if (ImageFocus.imageInFocus == null)
			return;

		ImageFocus.imageInFocus.style.cursor = (   ImageFocus.imageInFocus.height >= window.innerHeight
												|| ImageFocus.imageInFocus.width >= window.innerWidth)
											   ? "move"
											   : "";
	},

	unfocusImage: () => {
		GWLog("ImageFocus.unfocusImage", "image-focus.js", 1);

		//  Remove image from overlay.
		if (ImageFocus.imageInFocus) {
			ImageFocus.imageInFocus.remove();
			ImageFocus.imageInFocus = null;
		}

		//	Update currently focused image in page.
		if (ImageFocus.currentlyFocusedImage) {
			//	Save reference to image-to-be-unfocused.
			let unfocusedImage = ImageFocus.currentlyFocusedImage;

			ImageFocus.currentlyFocusedImage.classList.remove("focused");
			ImageFocus.currentlyFocusedImage = null;

			//	Fire event.
			GW.notificationCenter.fireEvent("ImageFocus.imageDidUnfocus", { image: unfocusedImage });
		}
	},

	enterImageFocus: () => {
		GWLog("ImageFocus.enterImageFocus", "image-focus.js", 1);

		if (ImageFocus.overlay.classList.contains("engaged"))
			return;

		//	Show overlay.
		ImageFocus.overlay.classList.add("engaged");

		//  Add listener to zoom image with scroll wheel.
		window.addEventListener("wheel", ImageFocus.scrollEvent, { passive: false });

		//  Escape key unfocuses, spacebar resets.
		document.addEventListener("keyup", ImageFocus.keyUp);

		//  Prevent spacebar or arrow keys from scrolling page when image focused.
		requestAnimationFrame(() => {
			togglePageScrolling(false);
		});

		//  Moving mouse unhides image focus UI.
		if (GW.isMobile() == false)
			addMousemoveListener(ImageFocus.mouseMoved, { name: "ImageFocusMousemoveListener" });

		//	Drag-end event; also, click to unfocus.
		window.addEventListener("mouseup", ImageFocus.mouseUp);

		//	Fire event.
		GW.notificationCenter.fireEvent("ImageFocus.imageOverlayDidAppear");
	},

	exitImageFocus: () => {
		GWLog("ImageFocus.exitImageFocus", "image-focus.js", 1);

		/*	If currently focused image is part of the main image gallery, 
			preserve state.
		 */
		if (   ImageFocus.currentlyFocusedImage
			&& ImageFocus.currentlyFocusedImage.classList.contains("gallery-image")) {
			//	Update classes.
			ImageFocus.currentlyFocusedImage.classList.remove("focused");

			if (ImageFocus.currentlyFocusedImage.classList.contains("gallery-image")) {
				ImageFocus.currentlyFocusedImage.classList.add("last-focused");

				//  Set accesskey of currently focused image, to re-focus it.
				ImageFocus.currentlyFocusedImage.accessKey = "l";
			}

			//  Reset the hash, if needed.
			if (location.hash.startsWith("#if_slide_")) {
				let previousURL = URLFromString(location.href);
				previousURL.hash = ImageFocus.savedHash ?? "";
				relocate(previousURL.href);

				ImageFocus.savedHash = null;
			}
		}

		//	Unfocus currently focused image.
		ImageFocus.unfocusImage();

		//  Remove event listeners.
		document.removeEventListener("keyup", ImageFocus.keyUp);
		window.removeEventListener("wheel", ImageFocus.scrollEvent);
		window.removeEventListener("mouseup", ImageFocus.mouseUp);
		if (GW.isMobile() == false)
			removeMousemoveListener("ImageFocusMousemoveListener");

		//  Hide overlay.
		ImageFocus.overlay.classList.remove("engaged");

		requestAnimationFrame(() => {
			//  Re-enable page scrolling.
			togglePageScrolling(true);
		});

		//	Fire event.
		GW.notificationCenter.fireEvent("ImageFocus.imageOverlayDidDisappear");
	},

	getIndexOfFocusedImage: () => {
		let images = document.querySelectorAll(ImageFocus.galleryImagesSelector);
		let indexOfFocusedImage = -1;
		for (i = 0; i < images.length; i++) {
			if (images[i].classList.contains("focused")) {
				indexOfFocusedImage = i;
				break;
			}
		}
		return indexOfFocusedImage;
	},

	focusNextImage: (next = true) => {
		GWLog("ImageFocus.focusNextImage", "image-focus.js", 1);

		//	Find next image to focus.
		let images = document.querySelectorAll(ImageFocus.galleryImagesSelector);
		let indexOfFocusedImage = ImageFocus.getIndexOfFocusedImage();

		//	This shouldn’t happen, but...
		if (next ? (++indexOfFocusedImage == images.length) : (--indexOfFocusedImage == -1))
			return;

		//	Focus new image.
		ImageFocus.focusImage(images[indexOfFocusedImage]);
	},

	setImageFocusCaption: () => {
		GWLog("ImageFocus.setImageFocusCaption", "image-focus.js", 2);

		//	Used in comparison below.
		function textContentOf(node) {
			return node.textContent.trim().replace(/\s+/g, " ");
		}

		//	For truncating very long URLs.
		function truncatedURLString(urlString) {
			let maxLength = 160;
			return urlString.length > maxLength
				   ? urlString.slice(0, maxLength) + "…"
				   : urlString;
		}

		/*	Get the figure caption, the ‘title’ attribute of the image, and the 
			‘alt’ attribute of the image. Clean each of typographic invisibles
			and educate quotes. Discard duplicate strings. Wrap all remaining 
			(unique) strings in <p> tags, and inject into caption container.
		 */
		let figcaption = ImageFocus.currentlyFocusedImage.closest("figure").querySelector("figcaption");
		ImageFocus.overlay.querySelector(".caption").replaceChildren(newDocument(`<div class="caption-text-wrapper">` 
		  + [ ...[
				(figcaption ? figcaption.cloneNode(true) : null),
				newElement("SPAN", null, { "innerHTML": ImageFocus.currentlyFocusedImage.getAttribute("title") }),
				newElement("SPAN", null, { "innerHTML": ImageFocus.currentlyFocusedImage.getAttribute("alt") }),
			].map(element => {
				if (element)
					Typography.processElement(element, Typography.replacementTypes.CLEAN|Typography.replacementTypes.QUOTES);

				if (element?.tagName == "FIGCAPTION")
					element.innerHTML = Array.from(element.children).map(p => p.innerHTML).join("<br>\n<br>\n");

				return element;
			}).filter((element, index, array) => (
					element != null
				 && isNodeEmpty_metadataAware(element) == false
				 && textContentOf(element) != GW.defaultImageAuxText
				 && array.findIndex(otherElement => (
				 		otherElement != null
					 && textContentOf(otherElement) == textContentOf(element))
					) == index)
			).map(element => 
				`<p>${(element.innerHTML.trim())}</p>`
			)].join("") 
		  + `</div>`
		  + `<p class="image-url" title="Click to copy image URL to clipboard">`
		  	  + (ImageFocus.imageInFocus.src.startsWith("data:")
		  	     ? ``
		  	     : (  `<code class="url">`
					+ truncatedURLString(ImageFocus.imageInFocus.src)
					+ `</code>`))
			  + `<span class="icon-container">`
				  + `<span class="icon normal">`
					  + GW.svg("copy-regular")
				  + `</span>`
				  + `<span class="icon copied">`
					  + GW.svg("circle-check-solid")
				  + `</span>`
			  + `</span>`
		  + `</p>`));

		//	Activate click-to-copy on image URL.
		let imageURLContainer = ImageFocus.overlay.querySelector(".caption .image-url");
		imageURLContainer.addActivateEvent((event) => {
			copyTextToClipboard(ImageFocus.currentlyFocusedImage.src);

			//	Update icon.
			imageURLContainer.classList.add("copied");

            //  Flash URL, for visual feedback of copy operation.
            imageURLContainer.classList.add("flash");
            setTimeout(() => { imageURLContainer.classList.remove("flash"); }, 150);
		});
		imageURLContainer.addEventListener("mouseleave", (event) => {
			//	Reset icon.
			imageURLContainer.classList.remove("copied");
		});
	},

	focusImageSpecifiedByURL: () => {
		GWLog("ImageFocus.focusImageSpecifiedByURL", "image-focus.js", 1);

		if (location.hash.startsWith("#if_slide_")) {
			doWhenPageLoaded(() => {
				let images = document.querySelectorAll(ImageFocus.galleryImagesSelector);
				let imageToFocus = (/#if_slide_([0-9]+)/.exec(location.hash)||{})[1];
				if (   imageToFocus > 0
					&& imageToFocus <= images.length) {
					ImageFocus.focusImage(images[imageToFocus - 1]);
				}
			});
		}
	},

	/************************************/
	/* Image gallery UI showing / hiding.
	 ************************************/

	hideImageFocusUI: () => {
		GWLog("ImageFocus.hideImageFocusUI", "image-focus.js", 3);

		ImageFocus.overlay.querySelectorAll(ImageFocus.imageFocusUIElementsSelector).forEach(element => {
			element.classList.toggle("hidden", true);
		});
	},

	hideUITimerExpired: () => {
		GWLog("ImageFocus.hideUITimerExpired", "image-focus.js", 3);

		let timeSinceLastMouseMove = (new Date()) - ImageFocus.mouseLastMovedAt;
		if (timeSinceLastMouseMove < ImageFocus.hideUITimerDuration) {
			ImageFocus.hideUITimer = setTimeout(ImageFocus.hideUITimerExpired, (ImageFocus.hideUITimerDuration - timeSinceLastMouseMove));
		} else {
			ImageFocus.hideImageFocusUI();
			ImageFocus.cancelImageFocusHideUITimer();
		}
	},

	unhideImageFocusUI: () => {
		GWLog("ImageFocus.unhideImageFocusUI", "image-focus.js", 3);

		ImageFocus.overlay.querySelectorAll(ImageFocus.imageFocusUIElementsSelector).forEach(element => {
			element.classList.toggle("hidden", false);
		});

		ImageFocus.hideUITimer = setTimeout(ImageFocus.hideUITimerExpired, ImageFocus.hideUITimerDuration);
	},

	cancelImageFocusHideUITimer: () => {
		GWLog("ImageFocus.cancelImageFocusHideUITimer", "image-focus.js", 3);

		clearTimeout(ImageFocus.hideUITimer);
		ImageFocus.hideUITimer = null;
	},

	/*********/
	/* Events.
	 *********/

	//  Event listener for clicking on images to focus them.
	imageClickedToFocus: (event) => {
		GWLog("ImageFocus.imageClickedToFocus", "image-focus.js", 2);

		//	Focus the clicked image, but don’t scroll to it.
		ImageFocus.focusImage(event.target, false);
	},

	scrollEvent: (event) => {
		GWLog("ImageFocus.scrollEvent", "image-focus.js", 3);

		event.preventDefault();

		let image = ImageFocus.imageInFocus;

		//  Remove the filter.
		image.savedFilter = image.style.filter;
		image.style.filter = "none";

		//  Get bounding box of the image within the viewport.
		let imageBoundingBox = image.getBoundingClientRect();

		//  Calculate resize factor.
		let factor = ((image.height > 10 && image.width > 10) || event.deltaY < 0)
					 ? 1 + Math.sqrt(Math.abs(event.deltaY))/100.0
					 : 1;

		//  Resize.
		image.style.width = (event.deltaY < 0 ?
							(image.clientWidth * factor) :
							(image.clientWidth / factor))
							+ "px";
		image.style.height = "auto";

		//  Designate zoom origin.
		let zoomOrigin;

		//  Zoom from cursor if we’re zoomed in to where image exceeds screen, AND
		//  the cursor is over the image.
		let imageSizeExceedsWindowBounds = (   image.getBoundingClientRect().width > window.innerWidth
											|| image.getBoundingClientRect().height > window.innerHeight);
		let zoomingFromCursor =    imageSizeExceedsWindowBounds
								&& (   imageBoundingBox.left <= event.clientX
									&& event.clientX <= imageBoundingBox.right
									&& imageBoundingBox.top <= event.clientY
									&& event.clientY <= imageBoundingBox.bottom);

		//  Otherwise, if we’re zooming OUT, zoom from window center; if we’re
		//  zooming IN, zoom from image center.
		let zoomingFromWindowCenter = event.deltaY > 0;
		if (zoomingFromCursor)
			zoomOrigin = { x: event.clientX,
						   y: event.clientY };
		else if (zoomingFromWindowCenter)
			zoomOrigin = { x: window.innerWidth / 2,
						   y: window.innerHeight / 2 };
		else
			zoomOrigin = { x: imageBoundingBox.x + imageBoundingBox.width / 2,
						   y: imageBoundingBox.y + imageBoundingBox.height / 2 };

		//  Calculate offset from zoom origin.
		let offsetOfImageFromZoomOrigin = {
			x: imageBoundingBox.x - zoomOrigin.x,
			y: imageBoundingBox.y - zoomOrigin.y
		}

		//  Calculate delta from centered zoom.
		let deltaFromCenteredZoom = {
			x: image.getBoundingClientRect().x - (zoomOrigin.x + (event.deltaY < 0 ? offsetOfImageFromZoomOrigin.x * factor : offsetOfImageFromZoomOrigin.x / factor)),
			y: image.getBoundingClientRect().y - (zoomOrigin.y + (event.deltaY < 0 ? offsetOfImageFromZoomOrigin.y * factor : offsetOfImageFromZoomOrigin.y / factor))
		}

		//  Adjust image position appropriately.
		image.style.left = parseInt(getComputedStyle(image).left) - deltaFromCenteredZoom.x + "px";
		image.style.top = parseInt(getComputedStyle(image).top) - deltaFromCenteredZoom.y + "px";

		//  Gradually re-center image, if it’s smaller than the window.
		if (!imageSizeExceedsWindowBounds) {
			let imageCenter = { x: image.getBoundingClientRect().x + image.getBoundingClientRect().width / 2,
								y: image.getBoundingClientRect().y + image.getBoundingClientRect().height / 2 }
			let windowCenter = { x: window.innerWidth / 2,
								 y: window.innerHeight / 2 }
			let imageOffsetFromCenter = { x: windowCenter.x - imageCenter.x,
										  y: windowCenter.y - imageCenter.y }

			//  Divide the offset by 10 because we’re nudging the image toward center,
			//  not jumping it there.
			image.style.left = parseInt(getComputedStyle(image).left) + imageOffsetFromCenter.x / 10 + "px";
			image.style.top = parseInt(getComputedStyle(image).top) + imageOffsetFromCenter.y / 10 + "px";
		}

		//  Put the filter back.
		image.style.filter = image.savedFilter;

		//  Set the cursor appropriately.
		ImageFocus.setFocusedImageCursor();
	},

	mouseUp: (event) => {
		GWLog("ImageFocus.mouseUp", "image-focus.js", 2);

		//	Different handling for drag-end events than clicks.
		let imageWasBeingDragged = (window.onmousemove != null);

		//	Do this regardless of where the mouse-up is.
		if (   imageWasBeingDragged
			&& (   ImageFocus.imageInFocus.height >= window.innerHeight
				|| ImageFocus.imageInFocus.width >= window.innerWidth)) {
			window.onmousemove = "";

			//  Put the filter back.
			ImageFocus.imageInFocus.style.filter = ImageFocus.imageInFocus.savedFilter;
		}

		//	On mobile, tap when UI is hidden unhides UI.
		if (   GW.isMobile() 
			&& imageWasBeingDragged == false) {
			if (ImageFocus.hideUITimer == null) {
				//	If the UI was hidden, tap unhides it.
				ImageFocus.unhideImageFocusUI();

				/*	If caption is locked-unhidden, unlock it now (so that it 
					will be hidden along with the rest of the UI once the 
					timer expires).
				 */
				ImageFocus.overlay.querySelector(".caption").classList.remove("locked");

				//	A tap in this case does nothing else.
				return;
			} else if (event.target.closest(".caption") != null) {
				//	Lock-unhide caption, if tap is on it.
				ImageFocus.overlay.querySelector(".caption").classList.add("locked");
			}
		}

		//	Do nothing more if click is on a UI element.
		if (event.target.closest(ImageFocus.imageFocusUIElementsSelector))
			return;

		//  We only want to do anything on left-clicks.
		if (event.button != 0)
			return;

		//	Exit image focus, if image is not zoomed in.
		if (   (   ImageFocus.imageInFocus.height < window.innerHeight
				&& ImageFocus.imageInFocus.width < window.innerWidth)
			|| (   imageWasBeingDragged == false
				&& event.target != ImageFocus.imageInFocus))
			ImageFocus.exitImageFocus();
	},

	imageMouseDown: (event) => {
		GWLog("ImageFocus.imageMouseDown", "image-focus.js", 2);

		//  We only want to do anything on left-clicks.
		if (event.button != 0)
			return;

		//	Prevent browser/system drag-and-drop initiate.
		event.preventDefault();

		if (   ImageFocus.imageInFocus.height >= window.innerHeight
			|| ImageFocus.imageInFocus.width >= window.innerWidth) {
			let mouseCoordX = event.clientX;
			let mouseCoordY = event.clientY;

			let imageCoordX = parseInt(getComputedStyle(ImageFocus.imageInFocus).left);
			let imageCoordY = parseInt(getComputedStyle(ImageFocus.imageInFocus).top);

			//  Save the filter.
			ImageFocus.imageInFocus.savedFilter = ImageFocus.imageInFocus.style.filter;

			window.onmousemove = (event) => {
				//  Remove the filter.
				ImageFocus.imageInFocus.style.filter = "none";
				ImageFocus.imageInFocus.style.left = imageCoordX + event.clientX - mouseCoordX + "px";
				ImageFocus.imageInFocus.style.top = imageCoordY + event.clientY - mouseCoordY + "px";
			};
			return false;
		}
	},

	doubleClick: (event) => {
		GWLog("ImageFocus.doubleClick", "image-focus.js", 2);

		if (   ImageFocus.imageInFocus.height >= window.innerHeight
			|| ImageFocus.imageInFocus.width >= window.innerWidth)
			ImageFocus.resetFocusedImagePosition();
	},

	keyUp: (event) => {
		GWLog("ImageFocus.keyUp", "image-focus.js", 3);

		let allowedKeys = [ " ", "Spacebar", "Escape", "Esc", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Up", "Down", "Left", "Right" ];
		if (   !allowedKeys.includes(event.key)
			|| getComputedStyle(ImageFocus.overlay).display == "none")
			return;

		event.preventDefault();

		switch (event.key) {
		case "Escape":
		case "Esc":
			ImageFocus.exitImageFocus();
			break;
		case " ":
		case "Spacebar":
			ImageFocus.resetFocusedImagePosition();
			break;
		case "ArrowDown":
		case "Down":
		case "ArrowRight":
		case "Right":
			if (   ImageFocus.currentlyFocusedImage
				&& ImageFocus.currentlyFocusedImage.classList.contains("gallery-image"))
				ImageFocus.focusNextImage(true);
			break;
		case "ArrowUp":
		case "Up":
		case "ArrowLeft":
		case "Left":
			if (   ImageFocus.currentlyFocusedImage
				&& ImageFocus.currentlyFocusedImage.classList.contains("gallery-image"))
				ImageFocus.focusNextImage(false);
			break;
		}
	},

	mouseMoved: (event) => {
		GWLog("ImageFocus.mouseMoved", "image-focus.js", 3);

		let currentDateTime = new Date();

		if ([ ImageFocus.imageInFocus, 
			  ImageFocus.overlay, 
			  document.documentElement 
			 ].includes(event.target)) {
			if (ImageFocus.hideUITimer == null)
				ImageFocus.unhideImageFocusUI();

			ImageFocus.mouseLastMovedAt = currentDateTime;
		} else {
			ImageFocus.cancelImageFocusHideUITimer();
		}
	}
};

GW.notificationCenter.fireEvent("ImageFocus.didLoad");

ImageFocus.setup();

//	If the URL specifies an image, focus it after the page has loaded.
ImageFocus.focusImageSpecifiedByURL();
// dark-mode.js: Javascript library for controlling page appearance, toggling between regular white and ‘dark mode’
// Author: Said Achmiz
// Date: 2020-03-20
// When: Time-stamp: "2022-01-05 11:31:32 gwern"
// license: PD

/*	Experimental ‘dark mode’: Mac OS (Safari) lets users specify via an OS 
	widget ‘dark’/‘light’ to make everything appear bright-white or darker (e.g. 
	for darker at evening to avoid straining eyes & disrupting circadian 
	rhyhms); this then is exposed by Safari as a CSS variable which can be 
	selected on. This is also currently supported by Firefox weakly as an 
	about:config variable. Hypothetically, iOS in the future might use its 
	camera or the clock to set ‘dark mode’ automatically. 

	https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme
	https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/
	https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme

	Images are handled specially: images are *not* inverted/negated by default; 
	images with a special class, `.invert-auto` (set on images by automated 
	tools like ImageMagick scripts counting colors) or `.invert` 
	(set manually), will be inverted. (This is intended to allow inversion of 
	images which would invert well, like statistical graphs or charts, which are
	typically black-on-white, and are much more pleasant to read in dark mode
	when inverted to white-on-black.) Inversion is removed on image hover or 
	image-focus.js click-to-zoom.

	Because many users do not have access to a browser/OS which explicitly 
	supports dark mode, cannot modify the browser/OS setting without undesired 
	side-effects, wish to opt in only for specific websites, or simply forget 
	that they turned on dark mode & dislike it, we make dark mode controllable 
	by providing a widget at the top of the page.
 */

DarkMode = { ...DarkMode, 
	/*****************/
	/*	Configuration.
	 */
	modeOptions: [
		[ "auto", "Auto", "Auto Light/Dark", "Auto Light/Dark", "Set light or dark mode automatically, according to system-wide setting (Win: Start → Personalization → Colors; Mac: Apple → System-Preferences → Appearance; iOS: Settings → Display-and-Brightness; Android: Settings → Display)", "adjust-solid" ],
		[ "light", "Light", "Light Mode", "Light Mode", "Light mode at all times (black-on-white)", "sun-solid" ],
		[ "dark", "Dark", "Dark Mode", "Dark Mode", "Dark mode at all times (inverted: white-on-black)", "moon-solid" ]
	],

	selectedModeOptionNote: " [This option is currently selected.]",

	/******************/
	/*	Infrastructure.
	 */

	modeSelector: null,
	modeSelectorInteractable: true,

	/*************/
	/*	Functions.
	 */

	/*	Set up UI.
	 */
	setup: () => {
		GWLog("DarkMode.setup", "dark-mode.js", 1);

		//	Inject primary (page toolbar widget) mode selector.
		DarkMode.injectModeSelector();

		/*	Inject inline mode selectors in already-loaded content, and add
			rewrite processor to inject any inline selectors in subsequently
			loaded content.
		 */
		processMainContentAndAddRewriteProcessor("addInlineDarkModeSelectorsInLoadedContent", (container) => {
			container.querySelectorAll(".dark-mode-selector-inline").forEach(DarkMode.injectModeSelector);
			container.querySelectorAll(".dark-mode-selector").forEach(DarkMode.activateModeSelector);
		});
	},

	/******************/
	/*	Mode selection.
	 */

	//	Called by: DarkMode.injectModeSelector
	modeSelectorHTML: (inline = false) => {
		//	Get saved mode setting (or default).
		let currentMode = DarkMode.currentMode();

		let modeSelectorInnerHTML = DarkMode.modeOptions.map(modeOption => {
			let [ name, shortLabel, unselectedLabel, selectedLabel, desc, iconName ] = modeOption;
			let selected = (name == currentMode ? " selected" : " selectable");
			let disabled = (name == currentMode ? " disabled" : "");
			let active = (   currentMode == "auto"
						  && name == DarkMode.computedMode())
						  ? " active"
						  : "";
			if (name == currentMode)
				desc += DarkMode.selectedModeOptionNote;
			let label = inline
						? shortLabel
						: (name == currentMode
						   ? selectedLabel 
						   : unselectedLabel);
			return `<button
					 type="button"
					 class="select-mode-${name}${selected}${active}"
					 ${disabled}
					 tabindex="-1"
					 data-name="${name}"
					 title="${desc}"
					 >`
						+ `<span class="icon">${(GW.svg(iconName))}</span>`
						+ `<span 
							class="label"
							data-selected-label="${selectedLabel}"
							data-unselected-label="${unselectedLabel}"
							>${label}</span>`
				 + `</button>`;
		  }).join("");

		let selectorTag = (inline ? "span" : "div");
		let selectorId = (inline ? "" : "dark-mode-selector");
		let selectorClass = ("dark-mode-selector mode-selector" + (inline ? " mode-selector-inline" : ""));

		return `<${selectorTag} id="${selectorId}" class="${selectorClass}">${modeSelectorInnerHTML}</${selectorTag}>`;
	},

	modeSelectButtonClicked: (event) => {
		GWLog("DarkMode.modeSelectButtonClicked", "dark-mode.js", 2);

		let button = event.target.closest("button");

		//	Determine which setting was chosen (ie. which button was clicked).
		let selectedMode = button.dataset.name;

		/*	We don’t want clicks to go through if the transition 
			between modes has not completed yet, so we disable the 
			button temporarily while we’re transitioning between 
			modes.
		 */
		doIfAllowed(() => {
			//	Check if this is a click or an accesskey press.
			if (event.pointerId == -1) {
				button.blur();

				GW.pageToolbar.expandToolbarFlashWidgetDoThing("dark-mode-selector", () => {
					//	Actually change the mode.
					DarkMode.setMode(selectedMode);
				});
			} else {
				//	Actually change the mode.
				DarkMode.setMode(selectedMode);
			}
		}, DarkMode, "modeSelectorInteractable");
	},

	//	Called by: DarkMode.setup
	injectModeSelector: (replacedElement = null) => {
		GWLog("DarkMode.injectModeSelector", "dark-mode.js", 1);

		//	Inject the mode selector widget.
		let modeSelector;
		if (replacedElement) {
			modeSelector = elementFromHTML(DarkMode.modeSelectorHTML(true));
			replacedElement.replaceWith(modeSelector);
			wrapParenthesizedNodes("inline-mode-selector", modeSelector);
		} else {
			modeSelector = DarkMode.modeSelector = GW.pageToolbar.addWidget(DarkMode.modeSelectorHTML());
			DarkMode.activateModeSelector(modeSelector);
		}

	},

	//	Called by: DarkMode.setup
	activateModeSelector: (modeSelector) => {
		//	Activate mode selector widget buttons.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.addActivateEvent(DarkMode.modeSelectButtonClicked);
		});

		//	Register event handler to update mode selector state.
		GW.notificationCenter.addHandlerForEvent("DarkMode.didSetMode", (info) => {
			DarkMode.updateModeSelectorState(modeSelector);
		});

		/*	Add active media query to update mode selector state when system dark
			mode setting changes. (This is relevant only for the ‘auto’ setting.)
		 */
		doWhenMatchMedia(GW.mediaQueries.systemDarkModeActive, "DarkMode.updateModeSelectorStateForSystemDarkMode", () => { 
			DarkMode.updateModeSelectorState(modeSelector);
		});
	},

	//	Called by: DarkMode.didSetMode event handler
	//	Called by: DarkMode.updateModeSelectorStateForSystemDarkMode active media query
	updateModeSelectorState: (modeSelector = DarkMode.modeSelector) => {
		GWLog("DarkMode.updateModeSelectorState", "dark-mode.js", 2);

		/*	If the mode selector has not yet been injected, then do nothing.
		 */
		if (modeSelector == null)
			return;

		//	Get saved mode setting (or default).
		let currentMode = DarkMode.currentMode();

		//	Clear current buttons state.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.classList.remove("active");
			button.swapClasses([ "selectable", "selected" ], 0);
			button.disabled = false;

			//	Remove “[This option is currently selected.]” note.
			if (button.title.endsWith(DarkMode.selectedModeOptionNote))
				button.title = button.title.slice(0, (-1 * DarkMode.selectedModeOptionNote.length));

			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				//	Reset label text to unselected state.
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.unselectedLabel;
			}

			//	Clear accesskey.
			button.accessKey = "";
		});

		//	Set the correct button to be selected.
		modeSelector.querySelectorAll(`.select-mode-${currentMode}`).forEach(button => {
			button.swapClasses([ "selectable", "selected" ], 1);
			button.disabled = true;

			//	Append “[This option is currently selected.]” note.
			button.title += DarkMode.selectedModeOptionNote;

			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				//	Set label text to selected state.
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.selectedLabel;
			}
		});

		//	Set accesskey.
		let buttons = Array.from(modeSelector.querySelectorAll("button"));
		buttons[(buttons.findIndex(button => button.classList.contains("selected")) + 1) % buttons.length].accessKey = "d";

		/*	Ensure the right button (light or dark) has the “currently active” 
			indicator, if the current mode is ‘auto’.
		 */
		if (currentMode == "auto") {
			let activeMode = GW.mediaQueries.systemDarkModeActive.matches 
							 ? "dark" 
							 : "light";
			modeSelector.querySelector(`.select-mode-${activeMode}`).classList.add("active");
		}
	}
};

GW.notificationCenter.fireEvent("DarkMode.didLoad");

DarkMode.setup();
ReaderMode = { ...ReaderMode, 
	/*****************/
	/*	Configuration.
	 */
	maskedLinksSelector: "p a",

	deactivateTriggerElementSelector: "#reader-mode-disable-when-here, #see-also, #external-links, #appendix, #appendices, #navigation, #footer, #footer-decoration-container",

	showMaskedLinksDelay: 250,

	adjustedPopupTriggerDelay: 2400,

	modeOptions: [
		[ "auto", "Auto", "Auto Reader Mode", "Auto Reader Mode", "Reader mode enabled automatically on certain pages. (When enabled, hold Alt key to show links in text.)", "book-with-gear" ],
		[ "on", "On", "Enable Reader Mode", "Reader Mode Enabled", "Enable reader mode on all pages. (Hold Alt key to show links in text.)", "book-open-solid" ],
		[ "off", "Off", "Disable Reader Mode", "Reader-Mode Disabled", "Disable reader mode on all pages.", "book-open-regular" ]
	],

	selectedModeOptionNote: " [This option is currently selected.]",

	/******************/
	/*	Infrastructure.
	 */
	markdownBody: document.querySelector("#markdownBody"),

	maskedLinksKeyToggleInfoAlert: null,

	modeSelector: null,
	modeSelectorInteractable: true,

	deactivateOnScrollDownObserver: null,

	state: {
		hoveringOverLink: false,
		altKeyPressed: false
	},

	/*************/
	/*	Functions.
	 */

	/*	Set up reader mode UI and interactions.
	 */
	setup: () => {
		GWLog("ReaderMode.setup", "reader-mode.js", 1);

		//	Fully activate.
		if (ReaderMode.enabled() == true)
			ReaderMode.activate();

		//	Inject primary (page toolbar widget) mode selector.
		ReaderMode.injectModeSelector();

		/*	Inject inline mode selectors in already-loaded content, and add
			rewrite processor to inject any inline selectors in subsequently
			loaded content.
		 */
		processMainContentAndAddRewriteProcessor("addInlineReaderModeSelectorsInContainer", (container) => {
			container.querySelectorAll(".reader-mode-selector-inline").forEach(ReaderMode.injectModeSelector);
			container.querySelectorAll(".reader-mode-selector").forEach(ReaderMode.activateModeSelector);
		});
	},

	/******************/
	/*	Mode selection.
	 */

	//	Called by: ReaderMode.setMode
	saveMode: (newMode = ReaderMode.currentMode()) => {
		GWLog("ReaderMode.saveMode", "reader-mode.js", 1);

		if (newMode == ReaderMode.defaultMode)
			localStorage.removeItem("reader-mode-setting");
		else
			localStorage.setItem("reader-mode-setting", newMode);
	},

	//	Returns true if reader mode is currently active.
	active: () => {
		return document.body.classList.contains("reader-mode-active");
	},

	/*	Activate or deactivate reader mode, as determined by the current setting
		and the selected mode.
	 */
	//	Called by: ReaderMode.modeSelectButtonClicked
	setMode: (selectedMode = ReaderMode.currentMode()) => {
		GWLog("ReaderMode.setMode", "reader-mode.js", 1);

		//	Save the new setting.
		ReaderMode.saveMode(selectedMode);

		//	Activate or deactivate, as (and if) needed.
		if (   ReaderMode.enabled() == true
			&& ReaderMode.active() == false) {
			ReaderMode.activate();
		} else if (   ReaderMode.active() == true
				   && ReaderMode.enabled() == false) {
			ReaderMode.deactivate();
		}

		/*	Kill the intersection observer, if switching away from "auto" mode.
			Or, spawn the intersection observer, if switching to "auto" mode.
		 */
		if (   selectedMode != "auto"
			&& ReaderMode.deactivateOnScrollDownObserver != null) {
			ReaderMode.despawnObserver();
		} else if (   selectedMode == "auto"
				   && ReaderMode.active() == true
				   && ReaderMode.deactivateOnScrollDownObserver == null) {
			ReaderMode.spawnObserver();
		}

		//	Fire event.
		GW.notificationCenter.fireEvent("ReaderMode.didSetMode");
	},

	//	Called by: ReaderMode.injectModeSelector
	modeSelectorHTML: (inline = false) => {
		//	Get saved mode setting (or default).
		let currentMode = ReaderMode.currentMode();

		let modeSelectorInnerHTML = ReaderMode.modeOptions.map(modeOption => {
			let [ name, shortLabel, unselectedLabel, selectedLabel, desc, iconName ] = modeOption;
			let selected = (name == currentMode ? " selected" : " selectable");
			let disabled = (name == currentMode ? " disabled" : "");
			let active = ((   currentMode == "auto"
						   && name == (ReaderMode.enabled() ? "on" : "off"))
						  ? " active"
						  : "");
			if (name == currentMode)
				desc += ReaderMode.selectedModeOptionNote;
			let label = inline
						? shortLabel
						: (name == currentMode
						   ? selectedLabel 
						   : unselectedLabel);
			return `<button
					 type="button"
					 class="select-mode-${name}${selected}${active}"
					 ${disabled}
					 tabindex="-1"
					 data-name="${name}"
					 title="${desc}"
					 >`
						+ `<span class="icon">${(GW.svg(iconName))}</span>`
						+ `<span 
							class="label"
							data-selected-label="${selectedLabel}"
							data-unselected-label="${unselectedLabel}"
							>${label}</span>`
				 + `</button>`;
		  }).join("");

		let selectorTag = (inline ? "span" : "div");
		let selectorId = (inline ? "" : "reader-mode-selector");
		let selectorClass = ("reader-mode-selector mode-selector" + (inline ? " mode-selector-inline" : ""));

		return `<${selectorTag} id="${selectorId}" class="${selectorClass}">${modeSelectorInnerHTML}</${selectorTag}>`;
	},

	modeSelectButtonClicked: (event) => {
		GWLog("ReaderMode.modeSelectButtonClicked", "reader-mode.js", 2);

		let button = event.target.closest("button");

		// Determine which setting was chosen (ie. which button was clicked).
		let selectedMode = button.dataset.name;

		/*	We don’t want clicks to go through if the transition 
			between modes has not completed yet, so we disable the 
			button temporarily while we’re transitioning between 
			modes.
		 */
		doIfAllowed(() => {
			//	Check if this is a click or an accesskey press.
			if (event.pointerId == -1) {
				button.blur();

				GW.pageToolbar.expandToolbarFlashWidgetDoThing("reader-mode-selector", () => {
					//	Actually change the mode.
					ReaderMode.setMode(selectedMode);
				});
			} else {
				//	Actually change the mode.
				ReaderMode.setMode(selectedMode);
			}
		}, ReaderMode, "modeSelectorInteractable");
	},

	//	Called by: ReaderMode.setup
	injectModeSelector: (replacedElement = null) => {
		GWLog("ReaderMode.injectModeSelector", "reader-mode.js", 1);

		//	Inject the mode selector widget.
		let modeSelector;
		if (replacedElement) {
			modeSelector = elementFromHTML(ReaderMode.modeSelectorHTML(true));
			replacedElement.replaceWith(modeSelector);
			wrapParenthesizedNodes("inline-mode-selector", modeSelector);
		} else {
			modeSelector = ReaderMode.modeSelector = GW.pageToolbar.addWidget(ReaderMode.modeSelectorHTML());
			ReaderMode.activateModeSelector(modeSelector);
		}
	},

	//	Called by: ReaderMode.setup
	activateModeSelector: (modeSelector) => {
		//	Activate mode selector widget buttons.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.addActivateEvent(ReaderMode.modeSelectButtonClicked);
		});

		//	Register event handler to update mode selector state.
		GW.notificationCenter.addHandlerForEvent("ReaderMode.didSetMode", (info) => {
			ReaderMode.updateModeSelectorState(modeSelector);
		});

		//	Update state now.
		ReaderMode.updateModeSelectorState(modeSelector);
	},

	//	Called by: ReaderMode.didSetMode event handler
	//	Called by: ReaderMode.deactivateOnScrollDownObserver callback
	updateModeSelectorState: (modeSelector = ReaderMode.modeSelector) => {
		GWLog("ReaderMode.updateModeSelectorState", "reader-mode.js", 2);

		/*	If the mode selector has not yet been injected, then do nothing.
		 */
		if (modeSelector == null)
			return;

		//	Get saved mode setting (or default).
		let currentMode = ReaderMode.currentMode();

		//	Clear current buttons state.
		modeSelector.querySelectorAll("button").forEach(button => {
			button.classList.remove("active");
			button.swapClasses([ "selectable", "selected" ], 0);
			button.disabled = false;

			//	Remove “[This option is currently selected.]” note.
			if (button.title.endsWith(ReaderMode.selectedModeOptionNote))
				button.title = button.title.slice(0, (-1 * ReaderMode.selectedModeOptionNote.length));

			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				//	Reset label text to unselected state.
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.unselectedLabel;
			}

			//	Clear accesskey.
			button.accessKey = "";
		});

		//	Set the correct button to be selected.
		modeSelector.querySelectorAll(`.select-mode-${currentMode}`).forEach(button => {
			button.swapClasses([ "selectable", "selected" ], 1);
			button.disabled = true;
			button.title += ReaderMode.selectedModeOptionNote;

			if (modeSelector.classList.contains("mode-selector-inline") == false) {
				//	Set label text to selected state.
				let label = button.querySelector(".label");
				label.innerHTML = label.dataset.selectedLabel;
			}
		});

		//	Set accesskey.
		let buttons = Array.from(modeSelector.querySelectorAll("button"));
		buttons[(buttons.findIndex(button => button.classList.contains("selected")) + 1) % buttons.length].accessKey = "r";

		/*	Ensure the right button (on or off) has the “currently active”
			indicator, if the current mode is ‘auto’.
		 */
		if (currentMode == "auto") {
			let activeMode = ReaderMode.enabled() 
							 ? "on" 
							 : "off";
			modeSelector.querySelector(`.select-mode-${activeMode}`).classList.add("active");
		}
	},

	/***************************************************/
	/*	Activation / deactivation. (Core functionality.)
	 */

	/*	Masks links and hide other elements, as appropriate. This will hide
		linkicons and pop-frame indicators, and will thus cause reflow.
	 */
	//	Called by: ReaderMode.setMode
	activate: () => {
		GWLog("ReaderMode.activate", "reader-mode.js", 1);

		//	Add body classes.
		document.body.classList.add("reader-mode-active", "masked-links-hidden");

		//	Get a list of all the links that are to be masked.
		ReaderMode.maskedLinks = ReaderMode.markdownBody.querySelectorAll(ReaderMode.maskedLinksSelector);

		//	Mask links.
		ReaderMode.maskedLinks.forEach(link => {
			if (GW.isMobile() == false) {
				/*	Add `mouseenter` / `mouseleave` listeners to show/hide masked
					links on hover.
				 */
				link.removeMouseEnterEvent = onEventAfterDelayDo(link, "mouseenter", ReaderMode.showMaskedLinksDelay, ReaderMode.updateState, {
					cancelOnEvents: [ "mouseleave" ]
				});
				link.removeMouseLeaveEvent = onEventAfterDelayDo(link, "mouseleave", 0, ReaderMode.updateState);

				//	Add custom popup trigger delay.
				link.specialPopupTriggerDelay = () => {
					return (ReaderMode.maskedLinksVisible() == false
							? ReaderMode.adjustedPopupTriggerDelay
							: Popups.popupTriggerDelay);
				};
			}

			/*	Add custom link click behavior
				(Save the existing handler, if any. Required for popin support.)
			 */
			link.savedOnClick = link.onclick;
			link.onclick = (event) => { return (ReaderMode.maskedLinksVisible() == true); };
		});

		if (GW.isMobile() == false) {
			//	Inject info alert.
			ReaderMode.maskedLinksKeyToggleInfoAlert = addUIElement(`<div id="masked-links-key-toggle-info-alert">`
				+ `<p>`
					+ `<span class="icon">`
						+ GW.svg("book-open-solid")
					+ `</span>`
					+ `Hold <span class="key">alt</span> / <span class="key">option</span> key to show links</p>`
				+ `</div>`);

			//	Add key down/up listeners, to show/hide masked links with Alt key.
			document.addEventListener("keydown", ReaderMode.altKeyDownOrUp = (event) => {
				if (event.key != "Alt")
					return;

				ReaderMode.updateState(event);
			});
			document.addEventListener("keyup", ReaderMode.altKeyDownOrUp);
		}

		//	Update visual state.
		ReaderMode.updateVisibility({ maskedLinksVisible: false, maskedLinksKeyToggleInfoAlertVisible: false });

		//	Update document title.
		if (document.title.endsWith(ReaderMode.readerModeTitleNote) == false)
			document.title += ReaderMode.readerModeTitleNote;
	},

	//	Called by: ReaderMode.setMode
	spawnObserver: () => {
		GWLog("ReaderMode.spawnObserver", "reader-mode.js", 2);

		//	Create the observer.
		ReaderMode.deactivateOnScrollDownObserver = new IntersectionObserver((entries, observer) => {
			entries.forEach(entry => {
				if (entry.isIntersecting == false)
					return;

				ReaderMode.deactivate();
				ReaderMode.updateModeSelectorState();
				ReaderMode.despawnObserver();
			});
		}, { threshold: 1.0 });

		//	Commence observation.
		ReaderMode.deactivateOnScrollDownObserver.observe(document.querySelector(ReaderMode.deactivateTriggerElementSelector));
	},

	//	Called by: ReaderMode.setMode
	despawnObserver: () => {
		GWLog("ReaderMode.despawnObserver", "reader-mode.js", 2);

		ReaderMode.deactivateOnScrollDownObserver.disconnect();
		ReaderMode.deactivateOnScrollDownObserver = null;
	},

	/*	Unmasks links and reveal other elements, as appropriate. (This will 
		also un-hide pop-frame indicators.)
	 */
	//	Called by: ReaderMode.setMode
	//	Called by: ReaderMode.deactivateOnScrollDownObserver callback
	deactivate: () => {
		GWLog("ReaderMode.deactivate", "reader-mode.js", 1);

		//	Update document title.
		if (document.title.endsWith(ReaderMode.readerModeTitleNote))
			document.title = document.title.slice(0, (-1 * ReaderMode.readerModeTitleNote.length));

		//	Remove body classes.
		document.body.classList.remove("reader-mode-active", "masked-links-hidden");

		//	Remove info alert.
		if (ReaderMode.maskedLinksKeyToggleInfoAlert != null)
			ReaderMode.maskedLinksKeyToggleInfoAlert.remove();

		/*	Unmask every masked link. (Note that ReaderMode.maskedLinks is a
			NodeList, returned by a querySelectorAll call in
			ReaderMode.activate. If that function has never been called, then
			ReaderMode.maskedLinks will be null).
		 */
		(ReaderMode.maskedLinks || [ ]).forEach(link => {
			if (GW.isMobile() == false) {
				//	Remove `mouseenter` / `mouseleave` listeners from the link.
				link.removeMouseEnterEvent();
				link.removeMouseLeaveEvent();
				link.removeMouseEnterEvent = null;
				link.removeMouseLeaveEvent = null;

				//	Remove custom popup trigger delay.
				link.specialPopupTriggerDelay = null;
			}

			//	Re-enable normal link click behavior.
			link.onclick = link.savedOnClick;
			link.savedOnClick = null;
		});

		//	Re-layout sidenotes.
		if (window.Sidenotes)
			Sidenotes.updateSidenotePositions();

		if (GW.isMobile() == false) {
			//	Remove key down/up listeners (for the Alt key toggle).
			document.removeEventListener("keydown", ReaderMode.altKeyDownOrUp);
			document.removeEventListener("keyup", ReaderMode.altKeyDownOrUp);
			ReaderMode.altKeyDownOrUp = null;
		}
	},

	/****************/
	/*	Link masking.
	 */

	/*	Returns true if masked links (if any) are currently visible, false
		otherwise.
	 */
	maskedLinksVisible: () => {
		return (document.body.classList.contains("masked-links-hidden") == false);
	},

	/***********************************************/
	/*	Interaction-based state/visibility updating.
	 */

	/*	Update state after an event that might cause a visibility change.
	 */
	//	Called by: masked link `mouseenter`/`mouseleave` event handlers
	//	Called by: document `keydown`/`keyup` event handlers (for Alt key)
	updateState: (event) => {
		GWLog("ReaderMode.updateState", "reader-mode.js", 3);

		//	Update tracked state.
		switch (event.type) {
			case "mouseenter":
				ReaderMode.state.hoveringOverLink = true;
				break;
			case "mouseleave":
				ReaderMode.state.hoveringOverLink = false;
				break;
			case "keydown":
				ReaderMode.state.altKeyPressed = true;
				break;
			case "keyup":
				ReaderMode.state.altKeyPressed = false;
				break;
			default:
				break;
		}

		/*	Determine whether we should show or hide masked links and other
			elements.
		 */
		let shouldShowMaskedLinks = (ReaderMode.state.hoveringOverLink || ReaderMode.state.altKeyPressed);
		let shouldShowMaskedLinksKeyToggleInfoAlert = (ReaderMode.state.hoveringOverLink && !ReaderMode.state.altKeyPressed);

		//	Request the desired visibility update.
		ReaderMode.updateVisibility({
			maskedLinksVisible: shouldShowMaskedLinks,
			maskedLinksKeyToggleInfoAlertVisible: shouldShowMaskedLinksKeyToggleInfoAlert
		});
	},

	/*	Update visibility, based on desired visibility (the `update` argument)
		and the current visibility. (Applies to: masked links, masked links key
		toggle info alert panel.)
	 */
	//	Called by: ReaderMode.activate
	//	Called by: ReaderMode.updateState
	updateVisibility: (update) => {
		GWLog("ReaderMode.updateVisibility", "reader-mode.js", 3);

		/*	Show or hide masked links, depending on what visibility update has
			been requested, and whether it is necessary (i.e., whether or not
			things already are as they should be).
		 */
		if (   update.maskedLinksVisible == true
			&& ReaderMode.maskedLinksVisible() == false) {
			//	Show.
			document.body.classList.remove("masked-links-hidden");
		} else if (   update.maskedLinksVisible == false
				   && ReaderMode.maskedLinksVisible() == true) {
			//	Hide.
			document.body.classList.add("masked-links-hidden");
		}

		if (ReaderMode.maskedLinksKeyToggleInfoAlert != null) {
			//	Likewise, show or hide the key toggle info alert panel, as needed.
			if (update.maskedLinksKeyToggleInfoAlertVisible) {
				//	Show.
				ReaderMode.maskedLinksKeyToggleInfoAlert.classList.remove("hidden");
			} else {
				//	Hide.
				ReaderMode.maskedLinksKeyToggleInfoAlert.classList.add("hidden");
			}
		}
	},
};

GW.notificationCenter.fireEvent("ReaderMode.didLoad");

/*	Ensure that we run setup only after Extracts have completed their setups. 
	(This is so that the onclick handlers and so on are already in place.)
 */
if (window.Extracts) {
    ReaderMode.setup();
} else {
    GW.notificationCenter.addHandlerForEvent("Extracts.didLoad", (info) => {
        ReaderMode.setup();
    }, { once: true });
}
