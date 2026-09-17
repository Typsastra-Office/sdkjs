/*
 * Enhanced Unicode logical-unit tests.
 * Run with: node common/libfont/test/logicalunits.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
global.AscFonts = {
	HB_DIRECTION : {
		HB_DIRECTION_LTR : 4,
		HB_DIRECTION_RTL : 5,
		HB_DIRECTION_TTB : 6,
		HB_DIRECTION_BTT : 7
	},
	HB_SCRIPT : {
		HB_SCRIPT_INHERITED : 1,
		HB_SCRIPT_COMMON : 2
	},
	HB_StartString : function() {},
	StringShaper : function() {},
	HB_AppendToString : function(codePoint) {
		this.LastShapingCodePoint = codePoint;
	}
};
global.AscWord = {
	fontslot_None : 0
};
global.Asc = {
	LigaturesType : {
		None : 0
	}
};
global.AscCommon = {
	IsEnhancedUnicodeEnabled : function() { return false; }
};
global.AscFormat = {
	nVertTTeaVert : 0,
	nVertTThorz : 1,
	nVertTTmongolianVert : 2,
	nVertTTvert : 3,
	nVertTTvert270 : 4
};

const source = fs.readFileSync(path.join(__dirname, "..", "textshaper.js"), "utf8");
vm.runInThisContext(source, {filename : "textshaper.js"});
const paragraphSource = fs.readFileSync(path.join(__dirname, "..", "..", "..", "word", "Editor", "Paragraph", "TextShaper.js"), "utf8");
vm.runInThisContext(paragraphSource, {filename : "word/Editor/Paragraph/TextShaper.js"});

function createShaper()
{
	const shaper = new AscFonts.CTextShaper();
	shaper.StartString = function() {};
	shaper.private_CheckNewSegment = function(codePoint) {
		return codePoint;
	};
	return shaper;
}

function visualUnit(x, components)
{
	return {
		FontId          : 7,
		FontStyle       : 1,
		LogicalAdvanceX : 640,
		LogicalAdvanceY : 0,
		VisualX         : x,
		VisualY         : 0,
		Components      : components || [{Gid : 10, X : 0, Y : 0}]
	};
}

(function testDisabledByDefault()
{
	const shaper = createShaper();
	shaper.Buffer = [0x41];
	shaper.BufferCodePoints = [0x41];
	shaper.BufferSourceIndexes = [0];
	shaper.FlushLogicalUnit(visualUnit(0), 1);
	assert.deepStrictEqual(shaper.GetLogicalUnits(), []);
})();

(function testExplicitVerticalWritingModeUsesTopToBottomShaping()
{
	const shaper = createShaper();
	shaper.SetWritingMode(1);
	assert.strictEqual(shaper.GetWritingMode(), 1);
	assert.strictEqual(shaper.GetDirection(AscFonts.HB_SCRIPT.HB_SCRIPT_COMMON),
		AscFonts.HB_DIRECTION.HB_DIRECTION_TTB);
	assert.strictEqual(shaper.GetInlineAdvance(0, -640), 640,
		"TTB paragraph layout must advance on the HarfBuzz Y axis");
	shaper.SetWritingMode(0);
	assert.strictEqual(shaper.GetWritingMode(), 0);
	assert.strictEqual(shaper.GetInlineAdvance(640, 0), 640);
})();

(function testDrawingParagraphSelectsOnlyTrueVerticalWritingModes()
{
	function paragraph(vert)
	{
		const textBody = {
			getBodyPr : function() { return {vert : vert}; }
		};
		const content = {
			GetParent : function() { return textBody; }
		};
		return {
			GetParent : function() { return content; },
			CheckRunContent : function() {}
		};
	}

	const shaper = AscWord.ParagraphTextShaper;
	shaper.Shape(paragraph(AscFormat.nVertTTeaVert));
	assert.strictEqual(shaper.GetWritingMode(), AscFonts.WRITING_MODE.Vertical);
	assert.strictEqual(shaper.GetDirection(AscFonts.HB_SCRIPT.HB_SCRIPT_COMMON),
		AscFonts.HB_DIRECTION.HB_DIRECTION_TTB);

	shaper.Shape(paragraph(AscFormat.nVertTTmongolianVert));
	assert.strictEqual(shaper.GetWritingMode(), AscFonts.WRITING_MODE.Vertical);

	shaper.Shape(paragraph(AscFormat.nVertTTvert));
	assert.strictEqual(shaper.GetWritingMode(), AscFonts.WRITING_MODE.Horizontal,
		"rotated horizontal DrawingML text must remain Identity-H");

	shaper.Shape(paragraph(AscFormat.nVertTThorz));
	assert.strictEqual(shaper.GetWritingMode(), AscFonts.WRITING_MODE.Horizontal,
		"writing mode must reset between paragraphs");
})();

(function testSubstitutionKeepsAuthoritativeUnicode()
{
	const shaper = createShaper();
	shaper.BeginLogicalUnits();
	shaper.private_CheckNewSegment = function() {
		return 0x25A1;
	};
	shaper.AppendToString(0x1F642);

	assert.strictEqual(AscFonts.LastShapingCodePoint, 0x25A1);
	assert.deepStrictEqual(shaper.BufferCodePoints, [0x1F642]);

	shaper.FlushLogicalUnit(visualUnit(0), 1);
	assert.deepStrictEqual(shaper.EndLogicalUnits()[0].Unicode, [0x1F642]);
})();

(function testPresentationTransformKeepsEditorSourceUnicode()
{
	const shaper = createShaper();
	shaper.GetCodePoint = function() {
		return 0x41;
	};
	shaper.GetSourceCodePoint = function() {
		return 0x61;
	};
	shaper.BeginLogicalUnits();
	shaper.AppendToString({});
	shaper.FlushLogicalUnit(visualUnit(0), 1);

	assert.strictEqual(AscFonts.LastShapingCodePoint, 0x41);
	assert.deepStrictEqual(shaper.EndLogicalUnits()[0].Unicode, [0x61]);
})();

(function testMultiScalarAndMultiGlyphUnit()
{
	const shaper = createShaper();
	shaper.BeginLogicalUnits();
	[0x66, 0x66, 0x69].forEach(function(codePoint) {
		shaper.AppendToString(codePoint);
	});

	const components = [
		{Gid : 21, X : 0, Y : 0},
		{Gid : 34, X : 320, Y : 12}
	];
	shaper.FlushLogicalUnit(visualUnit(0, components), 3);
	const unit = shaper.EndLogicalUnits()[0];

	assert.deepStrictEqual(unit.Unicode, [0x66, 0x66, 0x69]);
	assert.deepStrictEqual(unit.Components, components);
	assert.strictEqual(unit.LogicalAdvanceX, 640);
})();

(function testRtlTraversalReturnsSourceOrder()
{
	const shaper = createShaper();
	shaper.BeginLogicalUnits();
	[0x05D0, 0x05D1, 0x05D2].forEach(function(codePoint) {
		shaper.AppendToString(codePoint);
	});
	shaper.Direction = AscFonts.HB_DIRECTION.HB_DIRECTION_RTL;
	shaper.ResetBuffer();

	shaper.FlushLogicalUnit(visualUnit(0), 1);
	shaper.FlushGrapheme(0, 0, 1, false);
	shaper.FlushLogicalUnit(visualUnit(640), 1);
	shaper.FlushGrapheme(0, 0, 1, false);
	shaper.FlushLogicalUnit(visualUnit(1280), 1);
	shaper.FlushGrapheme(0, 0, 1, false);

	const units = shaper.EndLogicalUnits();
	assert.deepStrictEqual(units.map(function(unit) { return unit.Unicode[0]; }), [0x05D0, 0x05D1, 0x05D2]);
	assert.deepStrictEqual(units.map(function(unit) { return unit.VisualIndex; }), [2, 1, 0]);
	assert.deepStrictEqual(units.map(function(unit) { return unit.VisualX; }), [1280, 640, 0]);
})();

(function testMixedSegmentsUseMonotonicSourceIndexes()
{
	const shaper = createShaper();
	shaper.BeginLogicalUnits();

	shaper.AppendToString(0x41);
	shaper.FlushLogicalUnit(visualUnit(0), 1);
	shaper.FlushGrapheme(0, 0, 1, false);
	shaper.ClearBuffer();
	++shaper.LogicalSegmentIndex;

	shaper.AppendToString(0x05D0);
	shaper.AppendToString(0x05D1);
	shaper.Direction = AscFonts.HB_DIRECTION.HB_DIRECTION_RTL;
	shaper.ResetBuffer();
	shaper.FlushLogicalUnit(visualUnit(0), 1);
	shaper.FlushGrapheme(0, 0, 1, false);
	shaper.FlushLogicalUnit(visualUnit(640), 1);
	shaper.FlushGrapheme(0, 0, 1, false);

	const units = shaper.EndLogicalUnits();
	assert.deepStrictEqual(units.map(function(unit) { return unit.SourceIndex; }), [0, 1, 2]);
	assert.deepStrictEqual(units.map(function(unit) { return unit.Unicode[0]; }), [0x41, 0x05D0, 0x05D1]);
	assert.deepStrictEqual(units.map(function(unit) { return unit.SegmentIndex; }), [0, 1, 1]);
})();

(function testEmojiAndCanonicalSequencesRemainExact()
{
	const emoji = createShaper();
	emoji.BeginLogicalUnits();
	[0x1F469, 0x200D, 0x1F4BB, 0xFE0F].forEach(function(codePoint) {
		emoji.AppendToString(codePoint);
	});
	emoji.FlushLogicalUnit(visualUnit(0), 4);
	assert.deepStrictEqual(emoji.EndLogicalUnits()[0].Unicode, [0x1F469, 0x200D, 0x1F4BB, 0xFE0F]);

	const composed = createShaper();
	composed.BeginLogicalUnits();
	composed.AppendToString(0x00E9);
	composed.FlushLogicalUnit(visualUnit(0), 1);

	const decomposed = createShaper();
	decomposed.BeginLogicalUnits();
	decomposed.AppendToString(0x65);
	decomposed.AppendToString(0x301);
	decomposed.FlushLogicalUnit(visualUnit(0), 2);

	assert.notDeepStrictEqual(composed.EndLogicalUnits()[0].Unicode, decomposed.EndLogicalUnits()[0].Unicode);
})();

(function testDiagnosticsAreOptInAndOutputNeutral()
{
	const diagnostics = [];
	const shaper = createShaper();
	shaper.BeginLogicalUnits(function(unit) {
		diagnostics.push(unit);
	});
	shaper.AppendToString(0x65);
	shaper.AppendToString(0x301);
	shaper.FlushLogicalUnit(visualUnit(0), 2);

	const units = shaper.EndLogicalUnits();
	assert.strictEqual(diagnostics.length, 1);
	assert.deepStrictEqual(diagnostics[0], units[0]);
	assert.strictEqual(shaper.IsLogicalUnitsEnabled(), false);
})();

console.log("Enhanced Unicode logical-unit tests passed");
