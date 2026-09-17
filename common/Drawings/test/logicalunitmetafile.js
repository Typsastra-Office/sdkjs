/*
 * Enhanced Unicode logical-unit metafile tests.
 * Run with: node common/Drawings/test/logicalunitmetafile.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
global.AscCommon = {};

const source = fs.readFileSync(path.join(__dirname, "..", "LogicalUnitMetafile.js"), "utf8");
vm.runInThisContext(source, {filename : "LogicalUnitMetafile.js"});

function Memory()
{
	this.data = [];
	this.pos = 0;
}
Memory.prototype.GetCurPosition = function() { return this.pos; };
Memory.prototype.Skip = function(count) {
	while (count-- > 0)
		this.data[this.pos++] = 0;
};
Memory.prototype.WriteByte = function(value) { this.data[this.pos++] = value & 0xFF; };
Memory.prototype.WriteShort = function(value) {
	this.WriteByte(value);
	this.WriteByte(value >>> 8);
};
Memory.prototype.WriteLong = function(value) {
	this.WriteByte(value);
	this.WriteByte(value >>> 8);
	this.WriteByte(value >>> 16);
	this.WriteByte(value >>> 24);
};
Memory.prototype.WriteDouble = function(value) {
	this.WriteLong(Math.trunc(value * 100000));
};
Memory.prototype.WriteLongAt = function(position, value) {
	let current = this.pos;
	this.pos = position;
	this.WriteLong(value);
	this.pos = current;
};

function readU32(bytes, offset)
{
	return (bytes[offset]
		| bytes[offset + 1] << 8
		| bytes[offset + 2] << 16
		| bytes[offset + 3] << 24) >>> 0;
}

function readI32(bytes, offset)
{
	return readU32(bytes, offset) | 0;
}

function fixture()
{
	return {
		Unicode        : [0x66, 0x66, 0x69, 0x1F642],
		SourceIndex    : 3,
		VisualIndex    : 1,
		LogicalAdvance : 4.125,
		VisualX        : 20.75,
		VisualY        : -3.5,
		Components     : [
			{Gid : 40, X : 0, Y : 0.125},
			{Gid : 57, X : 1.333339, Y : -0.25}
		]
	};
}

(function testVersionOneBinaryContract()
{
	const memory = new Memory();
	assert.strictEqual(AscCommon.LogicalUnitMetafile.Write(memory, fixture()), true);

	const bytes = memory.data;
	assert.strictEqual(bytes[0], 84);
	assert.strictEqual(readU32(bytes, 1), 4 + 24 + 4 * 4 + 12 * 2);
	assert.strictEqual(bytes.length, 1 + readU32(bytes, 1));
	assert.deepStrictEqual(bytes.slice(5, 9), [1, 0, 0, 0]);
	assert.strictEqual(readU32(bytes, 9), 4);
	assert.strictEqual(readU32(bytes, 13), 0x66);
	assert.strictEqual(readU32(bytes, 17), 0x66);
	assert.strictEqual(readU32(bytes, 21), 0x69);
	assert.strictEqual(readU32(bytes, 25), 0x1F642);
	assert.strictEqual(readI32(bytes, 29), 412500);
	assert.strictEqual(readI32(bytes, 33), 2075000);
	assert.strictEqual(readI32(bytes, 37), -350000);
	assert.strictEqual(readU32(bytes, 41), 2);
	assert.strictEqual(readU32(bytes, 45), 40);
	assert.strictEqual(readI32(bytes, 49), 0);
	assert.strictEqual(readI32(bytes, 53), 12500);
	assert.strictEqual(readU32(bytes, 57), 57);
	assert.strictEqual(readI32(bytes, 61), 133333);
	assert.strictEqual(readI32(bytes, 65), -25000);
})();

(function testVersionTwoCarriesVerticalWritingMode()
{
	const memory = new Memory();
	const unit = fixture();
	unit.WritingMode = AscCommon.LogicalUnitMetafile.WritingMode.Vertical;
	assert.strictEqual(AscCommon.LogicalUnitMetafile.Write(memory, unit), true);
	assert.deepStrictEqual(memory.data.slice(5, 9), [2, 1, 0, 0]);
})();

(function testInvalidUnitsDoNotMutateMemory()
{
	const invalidUnits = [
		Object.assign(fixture(), {WritingMode : 2}),
		Object.assign(fixture(), {Unicode : []}),
		Object.assign(fixture(), {Unicode : [0xD800]}),
		Object.assign(fixture(), {LogicalAdvance : -1}),
		Object.assign(fixture(), {VisualX : Infinity}),
		Object.assign(fixture(), {Components : []}),
		Object.assign(fixture(), {Components : [{Gid : 0, X : 0, Y : 0}]}),
		Object.assign(fixture(), {Components : [{Gid : 65536, X : 0, Y : 0}]})
	];

	invalidUnits.forEach(function(unit) {
		const memory = new Memory();
		memory.WriteByte(83);
		const before = memory.data.slice();
		assert.strictEqual(AscCommon.LogicalUnitMetafile.Write(memory, unit), false);
		assert.deepStrictEqual(memory.data, before);
	});
})();

(function testMixedBidiUnitsSortBySourceOrder()
{
	const units = [
		{SourceIndex : 4, VisualIndex : 0},
		{SourceIndex : 2, VisualIndex : 1},
		{SourceIndex : 3, VisualIndex : 2},
		{SourceIndex : 0, VisualIndex : 3},
		{SourceIndex : 1, VisualIndex : 4}
	];
	units.sort(AscCommon.LogicalUnitMetafile.CompareSourceOrder);
	assert.deepStrictEqual(units.map(function(unit) { return unit.SourceIndex; }), [0, 1, 2, 3, 4]);
})();

(function testCapabilityGateAndSourceOrderQueue()
{
	assert.strictEqual(AscCommon.IsEnhancedUnicodeEnabled(), false);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption({}), false);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption({enhancedUnicode : true}), true);
	assert.strictEqual(AscCommon.IsEnhancedUnicodeEnabled(), true);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption({}), false);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption({enhancedUnicode : true}), true);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption(null), false);
	assert.strictEqual(AscCommon.ApplyEnhancedUnicodeOption({enhancedUnicode : false}), false);
	assert.strictEqual(AscCommon.IsEnhancedUnicodeEnabled(), false);
	AscCommon.SetEnhancedUnicodeEnabled(true);
	assert.strictEqual(AscCommon.IsEnhancedUnicodeEnabled(), true);

	const queue = new AscCommon.LogicalUnitMetafile.Queue();
	const font = {Name : "Test", FontSize : 12, Style : 0};
	const legacyUnit = fixture();
	assert.strictEqual(queue.Add(legacyUnit, font), false);
	assert.deepStrictEqual(queue.Drain(), []);

	queue.SetEnabled(true);
	const visualOrder = [4, 2, 3, 0, 1];
	visualOrder.forEach(function(sourceIndex, visualIndex) {
		const unit = fixture();
		unit.SourceIndex = sourceIndex;
		unit.VisualIndex = visualIndex;
		assert.strictEqual(queue.Add(unit, font), true);
		unit.Unicode[0] = 0x42;
		unit.Components[0].Gid = 99;
	});

	const entries = queue.Drain();
	assert.deepStrictEqual(entries.map(function(entry) { return entry.Unit.SourceIndex; }), [0, 1, 2, 3, 4]);
	assert.strictEqual(entries[0].Unit.Unicode[0], 0x66);
	assert.strictEqual(entries[0].Unit.Components[0].Gid, 40);
	assert.strictEqual(queue.Drain().length, 0);
})();

(function testProtocolLimits()
{
	const maximumUnicode = fixture();
	maximumUnicode.Unicode = new Array(4096).fill(0x41);
	assert.strictEqual(AscCommon.LogicalUnitMetafile.Validate(maximumUnicode), true);

	const excessiveUnicode = fixture();
	excessiveUnicode.Unicode = new Array(4097).fill(0x41);
	assert.strictEqual(AscCommon.LogicalUnitMetafile.Validate(excessiveUnicode), false);

	const maximumComponents = fixture();
	maximumComponents.Components = new Array(4096).fill(null).map(function() {
		return {Gid : 1, X : 0, Y : 0};
	});
	assert.strictEqual(AscCommon.LogicalUnitMetafile.Validate(maximumComponents), true);
})();

console.log("Enhanced Unicode logical metafile tests passed");
