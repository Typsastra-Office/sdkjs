/*
 * (c) Copyright Ascensio System SIA 2010-2024
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation. In accordance with
 * Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement
 * of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR  PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The  interactive user interfaces in modified source and object code versions
 * of the Program must display Appropriate Legal Notices, as required under
 * Section 5 of the GNU AGPL version 3.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as
 * well as technical writing content are licensed under the terms of the
 * Creative Commons Attribution-ShareAlike 4.0 International. See the License
 * terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */

"use strict";

QUnit.module("Khmer WASM spellcheck", function(hooks)
{
	let spellchecker;

	hooks.before(async function()
	{
		spellchecker = new AscCommon.CKhmerSpellchecker({
			"basePath" : "../../../common/spell/khmer"
		});
		await spellchecker.init();
	});

	QUnit.test("segments continuous Khmer and preserves source ranges", function(assert)
	{
		let parts = spellchecker.getWordParts("ខ្ញុំសសេរភាសាខ្មែរ");
		assert.deepEqual(parts.map(function(part) { return part.word; }),
			["ខ្ញុំ", "សសេរ", "ភាសា", "ខ្មែរ"]);
		assert.deepEqual([parts[1].start, parts[1].end], [5, 9], "Typo uses UTF-16 source offsets");
		assert.strictEqual(spellchecker.checkWord("សសេរ"), false, "Known typo is rejected");
		assert.strictEqual(spellchecker.checkWord("សរសេរ"), true, "Correct spelling is accepted");
	});

	QUnit.test("returns correction suggestions", function(assert)
	{
		let suggestions = spellchecker.suggest("សសេរ");
		assert.strictEqual(suggestions[0], "សរសេរ");
	});

	QUnit.test("rejects unknown segments without diagnostic records", function(assert)
	{
		let text = "ការពិត្យាចុមមិចបានអតលោតអេរឺចឹងស្តី";
		let parts = spellchecker.getWordParts(text);
		let unknownWords = parts.filter(function(part)
		{
			return "ពិត្យាចុ" === part.word || "អេរឺចឹ" === part.word;
		});

		assert.strictEqual(unknownWords.length, 2, "Unknown source ranges are preserved");
		assert.strictEqual(spellchecker.checkWord("ពិត្យាចុ"), false,
			"Unknown segment is misspelled even without a diagnostic record");
		assert.strictEqual(spellchecker.checkWord("អេរឺចឹ"), false,
			"Second unknown segment is also rejected");
		assert.strictEqual(spellchecker.checkWord("មិច"), true,
			"Dictionary-valid segment remains accepted");
	});

	QUnit.test("maps segmented words across formatting runs", function(assert)
	{
		let previousGetter = AscCommon.getKhmerSpellchecker;
		AscCommon.getKhmerSpellchecker = function() { return spellchecker; };

		let added = [];
		let checker = {
			"Paragraph" : {"isRtlDirection" : function() { return false; }},
			"Add" : function(startRun, startPos, endRun, endPos, word, lang)
			{
				added.push({
					"startRun" : startRun.id,
					"startPos" : startPos,
					"endRun" : endRun.id,
					"endPos" : endPos,
					"word" : word,
					"lang" : lang
				});
			}
		};
		let collector = new AscWord.CParagraphSpellCheckerCollector(checker, true);
		let text = "ខ្ញុំសសេរភាសាខ្មែរ";
		let runs = [{"id" : "first"}, {"id" : "second"}];
		collector.HandleLang({"Val" : 1107, "Bidi" : -1});
		for (let i = 0; i < text.length; ++i)
		{
			let character = text[i];
			let run = i < 5 ? runs[0] : runs[1];
			let runPos = i < 5 ? i : i - 5;
			collector.HandleRunElement({
				"IsText" : function() { return true; },
				"IsPunctuation" : function() { return false; },
				"GetCodePoint" : function() { return character.codePointAt(0); },
				"GetDirectionFlag" : function() { return 0; },
				"GetCharForSpellCheck" : function() { return character; }
			}, {"Caps" : false}, run, runPos);
		}
		collector.FlushWord();
		AscCommon.getKhmerSpellchecker = previousGetter;

		assert.deepEqual(added.map(function(item) { return item.word; }),
			["ខ្ញុំ", "សសេរ", "ភាសា", "ខ្មែរ"]);
		assert.deepEqual(added[0], {
			"startRun" : "first", "startPos" : 0, "endRun" : "first", "endPos" : 5,
			"word" : "ខ្ញុំ", "lang" : 1107
		});
		assert.deepEqual(added[1], {
			"startRun" : "second", "startPos" : 0, "endRun" : "second", "endPos" : 4,
			"word" : "សសេរ", "lang" : 1107
		});
	});

	QUnit.test("merges Khmer results with fallback languages", function(assert)
	{
		let done = assert.async();
		let fallbackMessage = null;
		let api = {
			"spellCheck" : function(message) { fallbackMessage = message; },
			"checkDictionary" : function() { return false; },
			"onSpellCheck" : function(result)
			{
				assert.deepEqual(result.usrCorrect, [false, true]);
				done();
			}
		};

		spellchecker.wrapSpellCheckApi(api, function() {});
		api.spellCheck({
			"type" : "spell",
			"ParagraphId" : "paragraph",
			"RecalcId" : 1,
			"ElementId" : 0,
			"usrWords" : ["សសេរ", "hello"],
			"usrLang" : [1107, 1033]
		});

		assert.deepEqual(fallbackMessage.usrWords, ["hello"], "Only non-Khmer words reach Hunspell");
		api.onSpellCheck(Object.assign({}, fallbackMessage, {"usrCorrect" : [true]}));
	});

	QUnit.test("user dictionary suppresses an underline", function(assert)
	{
		spellchecker.addUserWord("សសេរ");
		assert.strictEqual(spellchecker.checkWord("សសេរ"), true);
		spellchecker.clearUserWords();
		assert.strictEqual(spellchecker.checkWord("សសេរ"), false);
	});
});
