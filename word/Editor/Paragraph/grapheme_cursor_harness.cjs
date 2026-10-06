"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "Paragraph.js"), "utf8");
const start = source.indexOf("var paragraphGraphemeSegmenter = null;");
const end = source.indexOf("Paragraph.prototype.getSearchPosByXY =", start);
assert.ok(start >= 0 && end > start);

class Pos {
	constructor(index, run = 0) { this.index = index; this.run = run; }
	Copy() { return new Pos(this.index, this.run); }
	Compare(other) { return this.index - other.index; }
	GetDepth() { return 2; }
	Get(index) { return index === 0 ? this.run : this.index; }
}
class Search {
	constructor() { this.Reset(); }
	Reset() { this.Found = false; this.Pos = null; }
	IsFound() { return this.Found; }
	GetPos() { return this.Pos; }
}
class Paragraph {
	constructor(text, marks, runs) {
		this.items = Array.from(text, (char, index) => ({
			run: runs ? runs[index] : 0,
			IsText: () => true,
			GetCodePoint: () => char.codePointAt(0),
			GetWidthVisible: () => 1,
			IsCombiningMark: () => !!(marks && marks.includes(index))
		}));
	}
	GetPrevRunElement(pos) { return this.items[pos.index - 1] || null; }
	GetNextRunElement(pos) { return this.items[pos.index] || null; }
	Get_LeftPos(search, pos) {
		if (pos.index > 0) {
			search.Pos = new Pos(pos.index - 1, this.items[pos.index - 1].run);
			search.Found = true;
		}
	}
	Get_RightPos(search, pos) {
		if (pos.index < this.items.length) {
			search.Pos = new Pos(pos.index + 1, this.items[pos.index].run);
			search.Found = true;
		}
	}
}

function load(intl) {
	vm.runInNewContext(source.slice(start, end), {
		Paragraph, CParagraphSearchPos: Search, window: {Intl: intl}
	}, {filename: "Paragraph.js"});
}

load(Intl);
function move(paragraph, index, forward) {
	const search = new Search();
	if (forward) paragraph.Get_RightPos(search, new Pos(index));
	else paragraph.Get_LeftPos(search, new Pos(index));
	assert.ok(search.IsFound());
	return paragraph.private_CorrectPosInCombiningMark(search.GetPos(), forward).index;
}

for (const [text, stops] of [
	["សួស្តី", [0, 2, 6]],
	["a\u0301b", [0, 2, 3]],
	["👩🏽‍💻x", [0, 4, 5]],
	["🇰🇭!", [0, 2, 3]],
	["क्षa", [0, 3, 4]],
	["\r\nx", [0, 2, 3]],
	["ab", [0, 1, 2]],
	// Khmer Coeng (U+17D2) subscript sequences must stay in one cluster.
	["ករុណកើតខ្មែរ", [0, 1, 3, 4, 6, 7, 11, 12]],
	["ខ្ម", [0, 3]],
	["ខ្ខ", [0, 3]]
]) {
	const paragraph = new Paragraph(text);
	for (let i = 0; i + 1 < stops.length; i++) {
		assert.equal(move(paragraph, stops[i], true), stops[i + 1], `${text}: right`);
		assert.equal(move(paragraph, stops[i + 1], false), stops[i], `${text}: left`);
	}
}

// A grapheme can span two formatting runs; the caret still has one stop.
const splitRun = new Paragraph("a\u0301\u0300", [1, 2], [0, 1, 1]);
assert.equal(move(splitRun, 0, true), 3);
assert.equal(splitRun.private_GetClosestPosInCombiningMark(new Pos(1, 1), 0).index, 0);
assert.equal(splitRun.private_GetClosestPosInCombiningMark(new Pos(1, 1), 1).index, 3);

// Math runs still use their existing shaped-mark navigation.
const mathRun = new Paragraph("a\u0301", [1]);
for (const item of mathRun.items) {
	item.IsText = () => false;
	item.IsMathText = () => true;
}
assert.equal(move(mathRun, 0, true), 2);

// A caret move in long non-Latin text must not scan the whole paragraph.
const longParagraph = new Paragraph("\u1780".repeat(20000));
let walkCount = 0;
for (const method of ["Get_LeftPos", "Get_RightPos"]) {
	const real = longParagraph[method];
	longParagraph[method] = function(search, pos) {
		++walkCount;
		return real.call(this, search, pos);
	};
}
assert.equal(move(longParagraph, 10000, true), 10001);
assert.ok(walkCount <= 2 * 32 + 1, `caret move walked ${walkCount} positions`);

// Older runtimes retain the existing shaped combining-mark correction.
load(null);
assert.equal(move(new Paragraph("a\u0301", [1]), 0, true), 2);

console.log("Grapheme caret navigation, selection endpoints, and hit-testing passed");
