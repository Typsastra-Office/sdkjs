/*
 * Copyright (C) Ascensio System SIA, 2009-2026
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation, together with the
 * additional terms provided in the LICENSE file.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. For
 * details, see the GNU AGPL at: https://www.gnu.org/licenses/agpl-3.0.html
 *
 * You can contact Ascensio System SIA by email at info@onlyoffice.com
 * or by postal mail at 20A-6 Ernesta Birznieka-Upisha Street, Riga,
 * LV-1050, Latvia, European Union.
 *
 * The interactive user interfaces in modified versions of the Program
 * are required to display Appropriate Legal Notices in accordance with
 * Section 5 of the GNU AGPL version 3.
 *
 * No trademark rights are granted under this License.
 *
 * All non-code elements of the Product, including illustrations,
 * icon sets, and technical writing content, are licensed under the
 * Creative Commons Attribution-ShareAlike 4.0 International License:
 * https://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 * This license applies only to such non-code elements and does not
 * modify or replace the licensing terms applicable to the Program's
 * source code, which remains licensed under the GNU Affero General
 * Public License v3.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

"use strict";

(function(window)
{
	const DEFAULT_HYPHENATION_ZONE = 360;
	const SCRIPT_TAG_TO_HARFBUZZ_NAME = {
		Latn: 'HB_SCRIPT_LATIN', Khmr: 'HB_SCRIPT_KHMER', Arab: 'HB_SCRIPT_ARABIC', Cyrl: 'HB_SCRIPT_CYRILLIC',
		Grek: 'HB_SCRIPT_GREEK', Hebr: 'HB_SCRIPT_HEBREW', Deva: 'HB_SCRIPT_DEVANAGARI', Thai: 'HB_SCRIPT_THAI',
		Laoo: 'HB_SCRIPT_LAO', Mymr: 'HB_SCRIPT_MYANMAR', Hani: 'HB_SCRIPT_HAN', Hira: 'HB_SCRIPT_HIRAGANA',
		Kana: 'HB_SCRIPT_KATAKANA', Hang: 'HB_SCRIPT_HANGUL'
	};
	
	/**
	 * Класс с глобальными настройками для документа
	 * @param {AscWord.CDocument} logicDocument
	 * @constructor
	 */
	function DocumentSettings(logicDocument)
	{
		this.LogicDocument = logicDocument;
		
		this.View                 = Asc.DocumentView.None;
		this.MathSettings         = new AscWord.MathSettings();
		this.CompatibilityMode    = AscCommon.document_compatibility_mode_Current;
		this.SdtSettings          = new AscWord.SdtGlobalSettings();
		this.SpecialFormsSettings = new AscWord.SpecialFormsGlobalSettings();
		this.WriteProtection      = undefined;
		this.DocumentProtection   = undefined !== AscCommonWord.CDocProtect && logicDocument ? new AscCommonWord.CDocProtect() : null;
		// TODO: Переделать AscCommonWord.CDocProtect. Класс с Id внутри класса без Id - очень плохо
		
		// Параметры, связанные с автоматической расстановкой переносов
		this.autoHyphenation        = undefined;
		this.hyphenationZone        = undefined;
		this.consecutiveHyphenLimit = undefined;
		this.doNotHyphenateCaps     = undefined;
		
		this.ListSeparator   = undefined;
		this.DecimalSymbol   = undefined;
		this.scriptFontSettings = [];
		this.GutterAtTop     = false;
		this.MirrorMargins   = false;
		this.TrackRevisions  = false; // Флаг рецензирования, который записан в самом файле

		// Compatibility
		this.SplitPageBreakAndParaMark        = false;
		this.DoNotExpandShiftReturn           = false;
		this.BalanceSingleByteDoubleByteWidth = false;
		this.UlTrailSpace                     = false;
		this.UseFELayout                      = false;
	}
	DocumentSettings.prototype.getCompatibilityMode = function()
	{
		return this.CompatibilityMode;
	};
	DocumentSettings.prototype.isAutoHyphenation = function()
	{
		return !!this.autoHyphenation;
	};
	DocumentSettings.prototype.setAutoHyphenation = function(isAuto)
	{
		if (this.autoHyphenation === isAuto
			|| (!isAuto && undefined === this.autoHyphenation))
			return;
		
		AscCommon.AddAndExecuteChange(new CChangesDocumentSettingsAutoHyphenation(this.LogicDocument, this.autoHyphenation, isAuto));
	};
	DocumentSettings.prototype.isHyphenateCaps = function()
	{
		return (true !== this.doNotHyphenateCaps);
	};
	DocumentSettings.prototype.setHyphenateCaps = function(isHyphenate)
	{
		if (this.doNotHyphenateCaps === !isHyphenate
			|| (isHyphenate && undefined === this.doNotHyphenateCaps))
			return;
		
		AscCommon.AddAndExecuteChange(new CChangesDocumentSettingsDoNotHyphenateCaps(this.LogicDocument, this.doNotHyphenateCaps, !isHyphenate));
	};
	DocumentSettings.prototype.getConsecutiveHyphenLimit = function()
	{
		return !this.consecutiveHyphenLimit ? 0 : this.consecutiveHyphenLimit;
	};
	DocumentSettings.prototype.setConsecutiveHyphenLimit = function(limit)
	{
		if (this.consecutiveHyphenLimit === limit
			|| (undefined === this.consecutiveHyphenLimit && !limit))
			return;
		
		AscCommon.AddAndExecuteChange(new CChangesDocumentSettingsConsecutiveHyphenLimit(this.LogicDocument, this.consecutiveHyphenLimit, limit));
	};
	DocumentSettings.prototype.getHyphenationZone = function()
	{
		return undefined === this.hyphenationZone ? DEFAULT_HYPHENATION_ZONE : this.hyphenationZone;
	};
	DocumentSettings.prototype.getScriptFontSettings = function()
	{
		return JSON.parse(JSON.stringify(this.scriptFontSettings || []));
	};
	DocumentSettings.prototype.setScriptFontSettings = function(settings)
	{
		var normalized = [];
		var seenScripts = {};
		if (Array.isArray(settings))
		{
			for (var i = 0; i < settings.length; ++i)
			{
				var item = settings[i];
				if (!item || 'string' !== typeof item.script || 'string' !== typeof item.font)
					continue;
				var size = Math.round(parseFloat(item.size) * 2) / 2;
				if (!item.script || !item.font || !isFinite(size) || size <= 0 || size > 300 || seenScripts[item.script])
					continue;
				seenScripts[item.script] = true;
				normalized.push({script: item.script, font: item.font, size: size});
			}
		}

		var oldSettings = this.getScriptFontSettings();
		if (JSON.stringify(oldSettings) === JSON.stringify(normalized))
			return;

		AscCommon.AddAndExecuteChange(new CChangesDocumentSettingsScriptFonts(this.LogicDocument, oldSettings, normalized));
	};
	DocumentSettings.prototype.getScriptFontByScript = function(script)
	{
		if (!script || !this.scriptFontSettings)
			return null;
		var scriptTags = window['AscFonts'] && AscFonts.HB_SCRIPT;
		for (var i = 0; i < this.scriptFontSettings.length; ++i)
		{
			var settings = this.scriptFontSettings[i];
			var scriptName = /^HB_SCRIPT_/.test(settings.script) ? settings.script : SCRIPT_TAG_TO_HARFBUZZ_NAME[settings.script];
			if (scriptName && scriptTags && scriptTags[scriptName] === script)
				return this.scriptFontSettings[i];
		}
		return null;
	};
	DocumentSettings.prototype.getScriptFontByCodePoint = function(codePoint)
	{
		if (!window['AscFonts'] || !AscFonts.hb_get_script_by_unicode)
			return null;
		return this.getScriptFontByScript(AscFonts.hb_get_script_by_unicode(codePoint));
	};
	DocumentSettings.prototype.setHyphenationZone = function(zone)
	{
		if (this.hyphenationZone === zone
			|| (undefined === this.hyphenationZone && DEFAULT_HYPHENATION_ZONE === zone))
			return;
		
		AscCommon.AddAndExecuteChange(new CChangesDocumentSettingsHyphenationZone(this.LogicDocument, this.hyphenationZone, zone));
	};
	//--------------------------------------------------------export----------------------------------------------------
	window['AscWord'].DocumentSettings          = DocumentSettings;
	window['AscWord'].DEFAULT_DOCUMENT_SETTINGS = new DocumentSettings(null);
	window['AscWord'].DEFAULT_HYPHENATION_ZONE  = DEFAULT_HYPHENATION_ZONE;

})(window);
