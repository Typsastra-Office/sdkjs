/*
 * Enhanced Unicode logical-unit geometry tests.
 * Run with: node common/Drawings/test/logicalunitgeometry.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
global.AscFonts = {
	MEASURE_FONTSIZE : 576,
	GRAPHEME_STRING_MAX_LEN : 1024
};
global.AscCommon = {
	FontNameMap : {
		GetName : function(id) { return "Font-" + id; }
	}
};

const source = fs.readFileSync(path.join(__dirname, "..", "..", "libfont", "grapheme.js"), "utf8");
vm.runInThisContext(source, {filename : "grapheme.js"});

(function testRawHarfBuzzGeometryConvertsToRendererCoordinates()
{
	let selectedFont = null;
	let output = null;
	const context = {
		IsTextLogicalUnitsEnabled : function() { return true; },
		SetFontInternal : function(name, size, style) {
			selectedFont = {Name : name, Size : size, Style : style};
		},
		DrawTextLogicalUnit : function(unit) {
			output = unit;
			return true;
		}
	};
	const input = {
		Unicode         : [0x66, 0x69],
		SourceIndex     : 2,
		VisualIndex     : 1,
		FontId          : 7,
		FontStyle       : 3,
		LogicalAdvanceX : 1152,
		LogicalAdvanceY : 0,
		Components      : [
			{Gid : 40, X : 0, Y : 64},
			{Gid : 57, X : 576, Y : -32}
		]
	};

	assert.strictEqual(AscFonts.DrawTextLogicalUnit(input, context, 10, 20, 12), true);
	assert.deepStrictEqual(selectedFont, {Name : "Font-7", Size : 12, Style : 3});
	assert.deepStrictEqual(output.Unicode, input.Unicode);
	assert.strictEqual(output.SourceIndex, 2);
	assert.strictEqual(output.VisualIndex, 1);
	assert.strictEqual(output.VisualX, 10);
	assert.strictEqual(output.VisualY, 20);

	const coefficient = 25.4 / 72 / 64 / 576 * 12;
	assert.strictEqual(output.LogicalAdvance, 1152 * coefficient);
	assert.strictEqual(output.Components[0].X, 0);
	assert.strictEqual(output.Components[0].Y, -64 * coefficient);
	assert.strictEqual(output.Components[1].X, 576 * coefficient);
	assert.strictEqual(output.Components[1].Y, 32 * coefficient);
})();

(function testExplicitVerticalUnitsUseIdentityVGeometry()
{
	const unit = {
		Unicode         : [0x4E00],
		SourceIndex     : 0,
		VisualIndex     : 0,
		WritingMode     : 1,
		FontId          : 7,
		FontStyle       : 0,
		LogicalAdvanceX : 0,
		LogicalAdvanceY : -576,
		Components      : [{Gid : 40, X : 0, Y : 0}]
	};
	let output = null;
	const enabled = {
		IsTextLogicalUnitsEnabled : function() { return true; },
		SetFontInternal : function() {},
		DrawTextLogicalUnit : function(value) { output = value; return true; }
	};
	assert.strictEqual(AscFonts.DrawTextLogicalUnit(unit, enabled, 10, 20, 12), true);
	assert.strictEqual(output.WritingMode, 1);
	assert.strictEqual(output.LogicalAdvance, 576 * (25.4 / 72 / 64 / 576 * 12));

	unit.LogicalAdvanceY = 576;
	assert.strictEqual(AscFonts.DrawTextLogicalUnit(unit, enabled, 0, 0, 12), false,
		"bottom-to-top vertical units must use compatibility drawing");

	unit.LogicalAdvanceY = -576;
	unit.WritingMode = 0;
	assert.strictEqual(AscFonts.DrawTextLogicalUnit(unit, enabled, 0, 0, 12), false);

	const disabled = {
		IsTextLogicalUnitsEnabled : function() { return false; },
		DrawTextLogicalUnit : function() { throw new Error("must not emit"); }
	};
	unit.WritingMode = 1;
	assert.strictEqual(AscFonts.DrawTextLogicalUnit(unit, disabled, 0, 0, 12), false);
})();

console.log("Enhanced Unicode logical geometry tests passed");
