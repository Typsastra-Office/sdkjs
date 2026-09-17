/*
 * (c) Copyright Ascensio System SIA 2010-2024
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation.
 */

"use strict";

(function(window)
{
	const COMMAND = 84;
	const HORIZONTAL_VERSION = 1;
	const WRITING_MODE_VERSION = 2;
	const WRITING_MODE_HORIZONTAL = 0;
	const WRITING_MODE_VERTICAL = 1;
	const MAX_RECORD_SIZE = 1024 * 1024;
	const MAX_UNICODE_COUNT = 4096;
	const MAX_COMPONENT_COUNT = 4096;
	const FIXED_SCALE = 100000;
	const INT32_MIN = -2147483648;
	const INT32_MAX = 2147483647;
	let enhancedUnicodeEnabled = false;

	function isUnicodeScalar(value)
	{
		return Number.isInteger(value)
			&& value >= 0
			&& value <= 0x10FFFF
			&& !(value >= 0xD800 && value <= 0xDFFF);
	}

	function isFixed(value)
	{
		if (!Number.isFinite(value))
			return false;

		let scaled = Math.trunc(value * FIXED_SCALE);
		return scaled >= INT32_MIN && scaled <= INT32_MAX;
	}

	function validate(unit)
	{
		if (!unit || (undefined !== unit.WritingMode
			&& unit.WritingMode !== WRITING_MODE_HORIZONTAL
			&& unit.WritingMode !== WRITING_MODE_VERTICAL)
			|| !Array.isArray(unit.Unicode)
			|| unit.Unicode.length === 0 || unit.Unicode.length > MAX_UNICODE_COUNT
			|| !Array.isArray(unit.Components)
			|| unit.Components.length === 0 || unit.Components.length > MAX_COMPONENT_COUNT)
			return false;

		for (let index = 0; index < unit.Unicode.length; ++index)
		{
			if (!isUnicodeScalar(unit.Unicode[index]))
				return false;
		}

		if (!isFixed(unit.LogicalAdvance) || unit.LogicalAdvance < 0
			|| !isFixed(unit.VisualX) || !isFixed(unit.VisualY))
			return false;

		for (let index = 0; index < unit.Components.length; ++index)
		{
			let component = unit.Components[index];
			if (!component || !Number.isInteger(component.Gid)
				|| component.Gid <= 0 || component.Gid > 0xFFFF
				|| !isFixed(component.X) || !isFixed(component.Y))
				return false;
		}

		return 4 + 24 + 4 * unit.Unicode.length + 12 * unit.Components.length <= MAX_RECORD_SIZE;
	}

	function compareSourceOrder(a, b)
	{
		let first = a.Unit ? a.Unit : a;
		let second = b.Unit ? b.Unit : b;
		let sourceOrder = first.SourceIndex - second.SourceIndex;
		return 0 !== sourceOrder ? sourceOrder : first.VisualIndex - second.VisualIndex;
	}

	function CLogicalUnitQueue()
	{
		this.Enabled = false;
		this.Entries = [];
	}
	CLogicalUnitQueue.prototype.SetEnabled = function(enabled)
	{
		this.Enabled = true === enabled;
	};
	CLogicalUnitQueue.prototype.IsEnabled = function()
	{
		return this.Enabled;
	};
	CLogicalUnitQueue.prototype.Add = function(unit, font, color)
	{
		if (!this.Enabled || !validate(unit) || !font
			|| !Number.isInteger(unit.SourceIndex) || unit.SourceIndex < 0
			|| !Number.isInteger(unit.VisualIndex) || unit.VisualIndex < 0)
			return false;
		this.Entries.push({
			Unit : {
				Unicode        : unit.Unicode.slice(),
				WritingMode    : unit.WritingMode === WRITING_MODE_VERTICAL
					? WRITING_MODE_VERTICAL : WRITING_MODE_HORIZONTAL,
				SourceIndex    : unit.SourceIndex,
				VisualIndex    : unit.VisualIndex,
				LogicalAdvance : unit.LogicalAdvance,
				VisualX        : unit.VisualX,
				VisualY        : unit.VisualY,
				Components     : unit.Components.map(function(component)
				{
					return {Gid : component.Gid, X : component.X, Y : component.Y};
				})
			},
			Font : {
				Name     : font.Name,
				FontSize : font.FontSize,
				Style    : font.Style
			},
			Color : color ? {R : color.R, G : color.G, B : color.B, A : color.A} : null
		});
		return true;
	};
	CLogicalUnitQueue.prototype.Drain = function()
	{
		let entries = this.Entries.slice().sort(compareSourceOrder);
		this.Entries.length = 0;
		return entries;
	};

	function write(memory, unit)
	{
		if (!memory || !validate(unit))
			return false;

		memory.WriteByte(COMMAND);
		let sizePosition = memory.GetCurPosition();
		memory.Skip(4);

		let writingMode = unit.WritingMode === WRITING_MODE_VERTICAL
			? WRITING_MODE_VERTICAL : WRITING_MODE_HORIZONTAL;
		memory.WriteByte(writingMode === WRITING_MODE_VERTICAL
			? WRITING_MODE_VERSION : HORIZONTAL_VERSION);
		memory.WriteByte(writingMode);
		memory.WriteShort(0);
		memory.WriteLong(unit.Unicode.length);
		for (let index = 0; index < unit.Unicode.length; ++index)
			memory.WriteLong(unit.Unicode[index]);

		memory.WriteDouble(unit.LogicalAdvance);
		memory.WriteDouble(unit.VisualX);
		memory.WriteDouble(unit.VisualY);
		memory.WriteLong(unit.Components.length);
		for (let index = 0; index < unit.Components.length; ++index)
		{
			let component = unit.Components[index];
			memory.WriteLong(component.Gid);
			memory.WriteDouble(component.X);
			memory.WriteDouble(component.Y);
		}

		let endPosition = memory.GetCurPosition();
		memory.WriteLongAt(sizePosition, endPosition - sizePosition);
		return true;
	}

	function setEnhancedUnicodeEnabled(enabled)
	{
		enhancedUnicodeEnabled = true === enabled;
	}

	function isEnhancedUnicodeEnabled()
	{
		return enhancedUnicodeEnabled;
	}

	function applyEnhancedUnicodeOption(options)
	{
		setEnhancedUnicodeEnabled(!!options && true === options["enhancedUnicode"]);
		return enhancedUnicodeEnabled;
	}

	window["AscCommon"] = window["AscCommon"] || {};
	window["AscCommon"].SetEnhancedUnicodeEnabled   = setEnhancedUnicodeEnabled;
	window["AscCommon"].IsEnhancedUnicodeEnabled    = isEnhancedUnicodeEnabled;
	window["AscCommon"].ApplyEnhancedUnicodeOption = applyEnhancedUnicodeOption;
	window["AscCommon"].LogicalUnitMetafile = {
		Command            : COMMAND,
		Version            : WRITING_MODE_VERSION,
		HorizontalVersion  : HORIZONTAL_VERSION,
		WritingMode        : {
			Horizontal : WRITING_MODE_HORIZONTAL,
			Vertical   : WRITING_MODE_VERTICAL
		},
		MaximumRecordSize  : MAX_RECORD_SIZE,
		MaximumUnicode     : MAX_UNICODE_COUNT,
		MaximumComponents  : MAX_COMPONENT_COUNT,
		Validate           : validate,
		CompareSourceOrder : compareSourceOrder,
		Queue              : CLogicalUnitQueue,
		Write              : write
	};
})(window);
