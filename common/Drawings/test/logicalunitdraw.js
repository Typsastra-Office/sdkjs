/*
 * Enhanced Unicode paragraph draw-gate tests.
 * Run with: node common/Drawings/test/logicalunitdraw.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
global.para_Text = 1;
global.AscWord = {
	CrunElementBase : function() {},
	CRunElementBase : function() {},
	CODEPOINT_TYPE  : {BASE : 0},
	TEXTWIDTH_DIVIDER : 1000
};
AscWord.CRunElementBase.prototype = {};
global.AscBidi = {
	getType : function() { return 0; },
	FLAG : {STRONG : 1, RTL : 2},
	DIRECTION_FLAG : {RTL : 1, LTR : 2, Other : 0}
};
global.AscFonts = {
	NO_GRAPHEME : 0,
	IsCheckSymbols : false,
	DrawTextLogicalUnit : function() { return false; },
	DrawGrapheme : function() {}
};
global.AscCommon = {};

const textPath = path.join(__dirname, "..", "..", "..", "word", "Editor", "Paragraph", "RunContent", "Text.js");
vm.runInThisContext(fs.readFileSync(textPath, "utf8"), {filename : "Text.js"});

function createText()
{
	const text = Object.create(AscWord.CRunText.prototype);
	text.Flags = (12 * 64) << 16;
	text.Grapheme = 17;
	text.TextLogicalUnit = {Unicode : [0x41]};
	text.IsNBSP = function() { return false; };
	return text;
}

(function testEnhancedModeSuppressesLegacyGlyphs()
{
	let logicalCalls = 0;
	let graphemeCalls = 0;
	AscFonts.DrawTextLogicalUnit = function() {
		++logicalCalls;
		return true;
	};
	AscFonts.DrawGrapheme = function() {
		++graphemeCalls;
	};

	createText().Draw(10, 20, {m_bIsTextDrawer : false}, {}, {}, undefined);
	assert.strictEqual(logicalCalls, 1);
	assert.strictEqual(graphemeCalls, 0);
})();

(function testLegacyModeKeepsExistingGraphemeDraw()
{
	let logicalCalls = 0;
	let graphemeCalls = 0;
	AscFonts.DrawTextLogicalUnit = function() {
		++logicalCalls;
		return false;
	};
	AscFonts.DrawGrapheme = function() {
		++graphemeCalls;
	};

	createText().Draw(10, 20, {m_bIsTextDrawer : false}, {}, {}, undefined);
	assert.strictEqual(logicalCalls, 1);
	assert.strictEqual(graphemeCalls, 1);
})();

(function testForcedAndTemporaryDrawingBypassLogicalUnits()
{
	let logicalCalls = 0;
	let graphemeCalls = 0;
	AscFonts.DrawTextLogicalUnit = function() {
		++logicalCalls;
		return true;
	};
	AscFonts.DrawGrapheme = function() {
		++graphemeCalls;
	};

	const forced = createText();
	forced.Draw(10, 20, {m_bIsTextDrawer : false}, {}, {}, 22);
	assert.strictEqual(logicalCalls, 0);
	assert.strictEqual(graphemeCalls, 1);
})();

console.log("Enhanced Unicode logical draw-gate tests passed");
