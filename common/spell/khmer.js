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

(function(window)
{
	const KHMER_LCID = 0x0453;
	const DEFAULT_BASE_PATH = "../../../../sdkjs/common/spell/khmer";
	const USER_WORDS_KEY = "euro-office.khmer-spellcheck.user-words.v1";
	const REQUEST_ID = "khmerSpellcheckRequestId";

	function resolveResourceUrl(url)
	{
		let result = new URL(url, window.location.href).toString();
		if (window["AscDesktopEditor"] && 0 === result.indexOf("file:///"))
			return "ascdesktop://fonts/" + result.substring(8);
		return result;
	}

	function loadBinary(url)
	{
		url = resolveResourceUrl(url);
		return new Promise(function(resolve, reject)
		{
			let xhr = new XMLHttpRequest();
			xhr.open("GET", url, true);
			xhr.responseType = "arraybuffer";
			xhr.onload = function()
			{
				if (xhr.response && (200 === xhr.status || 0 === xhr.status))
					resolve(new Uint8Array(xhr.response));
				else
					reject(new Error("Unable to load " + url + " (status " + xhr.status + ")"));
			};
			xhr.onerror = function()
			{
				reject(new Error("Unable to load " + url));
			};
			xhr.send(null);
		});
	}

	function loadScript(url)
	{
		if (window["AscKhmerSegmenterWasm"])
			return Promise.resolve();

		return new Promise(function(resolve, reject)
		{
			let script = document.createElement("script");
			script.type = "text/javascript";
			script.src = url;
			script.onload = function()
			{
				if (window["AscKhmerSegmenterWasm"])
					resolve();
				else
					reject(new Error("Khmer segmenter WASM bindings did not initialize"));
			};
			script.onerror = function()
			{
				reject(new Error("Unable to load " + url));
			};
			document.head.appendChild(script);
		});
	}

	function copyMessage(message)
	{
		let result = {};
		for (let key in message)
		{
			if (message.hasOwnProperty(key))
				result[key] = message[key];
		}
		return result;
	}

	function normalizedUserWord(word)
	{
		if ("string" !== typeof word)
			return "";

		word = word.trim();
		if (!word)
			return "";

		return word.normalize ? word.normalize("NFC") : word;
	}

	function CKhmerSpellchecker(settings)
	{
		settings = settings || {};
		this.basePath = settings.basePath || DEFAULT_BASE_PATH;
		this.engine = settings.engine || null;
		this.ready = !!this.engine;
		this.failed = false;
		this.loading = null;
		this.pending = {};
		this.nextRequestId = 1;
		this.userWords = {};
		this.readyCallbacks = [];
		this.loadUserWords();
	}

	CKhmerSpellchecker.prototype.isKhmerLanguage = function(lang)
	{
		return KHMER_LCID === Number(lang);
	};
	CKhmerSpellchecker.prototype.isKhmerText = function(text)
	{
		return "string" === typeof text && /[\u1780-\u17ff\u19e0-\u19ff]/.test(text);
	};
	CKhmerSpellchecker.prototype.isReady = function()
	{
		return this.ready;
	};
	CKhmerSpellchecker.prototype.loadUserWords = function()
	{
		let words = [];
		try
		{
			let stored = window.localStorage ? window.localStorage.getItem(USER_WORDS_KEY) : null;
			if (stored)
				words = JSON.parse(stored);
		}
		catch (err)
		{
			words = [];
		}

		if (!Array.isArray(words))
			return;

		for (let i = 0; i < words.length; ++i)
		{
			let word = normalizedUserWord(words[i]);
			if (word)
				this.userWords[word] = true;
		}
	};
	CKhmerSpellchecker.prototype.saveUserWords = function()
	{
		try
		{
			if (window.localStorage)
				window.localStorage.setItem(USER_WORDS_KEY, JSON.stringify(Object.keys(this.userWords)));
		}
		catch (err)
		{
		}
	};
	CKhmerSpellchecker.prototype.addUserWord = function(word)
	{
		word = normalizedUserWord(word);
		if (!word)
			return false;

		this.userWords[word] = true;
		this.saveUserWords();
		return true;
	};
	CKhmerSpellchecker.prototype.clearUserWords = function()
	{
		this.userWords = {};
		this.saveUserWords();
	};
	CKhmerSpellchecker.prototype.hasUserWord = function(word)
	{
		return !!this.userWords[normalizedUserWord(word)];
	};
	CKhmerSpellchecker.prototype.onReady = function(callback)
	{
		if ("function" !== typeof callback)
			return;

		if (this.ready)
		{
			setTimeout(callback, 0);
			return;
		}

		this.readyCallbacks.push(callback);
	};
	CKhmerSpellchecker.prototype.init = function()
	{
		if (this.ready)
			return Promise.resolve(this);
		if (this.loading)
			return this.loading;
		if (this.failed || !window["WebAssembly"])
			return Promise.reject(new Error("Khmer spellcheck WASM is unavailable"));

		let self = this;
		let scriptUrl = this.basePath + "/khmer_segmenter.js";
		let wasmUrl = this.basePath + "/khmer_segmenter_bg.wasm";
		let dictionaryUrl = this.basePath + "/khmer_dictionary.kdict";

		this.loading = Promise.all([
			loadScript(scriptUrl),
			loadBinary(wasmUrl),
			loadBinary(dictionaryUrl)
		]).then(function(resources)
		{
			let bindings = window["AscKhmerSegmenterWasm"];
			return bindings({"module_or_path" : resources[1]}).then(function()
			{
				self.engine = new bindings.WasmKhmerSegmenter(resources[2]);
				self.ready = true;
				let callbacks = self.readyCallbacks;
				self.readyCallbacks = [];
				for (let i = 0; i < callbacks.length; ++i)
					callbacks[i]();
				return self;
			});
		}).catch(function(err)
		{
			self.failed = true;
			self.loading = null;
			if (window.console && console.warn)
				console.warn("Khmer spellcheck initialization failed", err);
			throw err;
		});

		return this.loading;
	};
	CKhmerSpellchecker.prototype.analyze = function(text)
	{
		if (!this.ready || !this.engine || "string" !== typeof text || !text)
			return null;

		try
		{
			return this.engine.analyzeWithProfile(text, "typing");
		}
		catch (err)
		{
			return null;
		}
	};
	CKhmerSpellchecker.prototype.checkWord = function(word)
	{
		if (this.hasUserWord(word))
			return true;

		let analysis = this.analyze(word);
		if (!analysis)
			return true;
		if (analysis.diagnostics && 0 < analysis.diagnostics.length)
			return false;

		let segments = analysis.segments || [];
		for (let i = 0; i < segments.length; ++i)
		{
			if (true === segments[i].isUnknown || false === segments[i].spellingValid)
				return false;
		}
		return true;
	};
	CKhmerSpellchecker.prototype.suggest = function(word)
	{
		if (!this.ready || !this.engine || this.hasUserWord(word))
			return [];

		try
		{
			let suggestions = this.engine.suggest(word, 5) || [];
			let result = [];
			for (let i = 0; i < suggestions.length; ++i)
			{
				let text = "string" === typeof suggestions[i] ? suggestions[i] : suggestions[i].text;
				if (text && -1 === result.indexOf(text))
					result.push(text);
			}
			return result;
		}
		catch (err)
		{
			return [];
		}
	};
	CKhmerSpellchecker.prototype.getWordParts = function(word)
	{
		let analysis = this.analyze(word);
		if (!analysis)
			return null;

		if (this.hasUserWord(word))
			return [{"start" : 0, "end" : word.length, "word" : word}];

		let parts = [];
		let diagnostics = analysis.diagnostics || [];
		let segments = analysis.segments || [];

		for (let i = 0; i < diagnostics.length; ++i)
		{
			let item = diagnostics[i];
			if (Number.isInteger(item.sourceStart) && Number.isInteger(item.sourceEnd)
				&& 0 <= item.sourceStart && item.sourceStart < item.sourceEnd && item.sourceEnd <= word.length)
			{
				parts.push({"start" : item.sourceStart, "end" : item.sourceEnd, "priority" : 1});
			}
		}

		for (let i = 0; i < segments.length; ++i)
		{
			let item = segments[i];
			if (!Number.isInteger(item.sourceStart) || !Number.isInteger(item.sourceEnd)
				|| item.sourceStart < 0 || item.sourceStart >= item.sourceEnd || item.sourceEnd > word.length)
				continue;

			let overlapsDiagnostic = false;
			for (let j = 0; j < parts.length; ++j)
			{
				if (1 === parts[j].priority && item.sourceStart < parts[j].end && item.sourceEnd > parts[j].start)
				{
					overlapsDiagnostic = true;
					break;
				}
			}
			if (!overlapsDiagnostic)
				parts.push({"start" : item.sourceStart, "end" : item.sourceEnd, "priority" : 0});
		}

		parts.sort(function(first, second)
		{
			return first.start - second.start || second.priority - first.priority || second.end - first.end;
		});

		let result = [];
		let offset = 0;
		for (let i = 0; i < parts.length; ++i)
		{
			let part = parts[i];
			if (part.start < offset)
				continue;
			if (offset < part.start)
				result.push({"start" : offset, "end" : part.start, "word" : word.slice(offset, part.start)});
			result.push({"start" : part.start, "end" : part.end, "word" : word.slice(part.start, part.end)});
			offset = part.end;
		}
		if (offset < word.length)
			result.push({"start" : offset, "end" : word.length, "word" : word.slice(offset)});

		return result.length ? result : null;
	};
	CKhmerSpellchecker.prototype.routeCommand = function(message, fallback, spellApi)
	{
		if (!this.ready || !message || !Array.isArray(message.usrWords) || !Array.isArray(message.usrLang))
		{
			fallback(message);
			return;
		}

		if ("suggest" === message.type && this.isKhmerLanguage(message.usrLang[0]))
		{
			let suggestResponse = copyMessage(message);
			suggestResponse.usrCorrect = [];
			suggestResponse.usrSuggest = [this.suggest(message.usrWords[0])];
			setTimeout(function() { spellApi.onSpellCheck(suggestResponse); }, 0);
			return;
		}

		if ("spell" !== message.type)
		{
			fallback(message);
			return;
		}

		let khmerCorrect = {};
		let otherIndices = [];
		let otherWords = [];
		let otherLanguages = [];
		for (let i = 0; i < message.usrWords.length; ++i)
		{
			if (this.isKhmerLanguage(message.usrLang[i]))
				khmerCorrect[i] = this.checkWord(message.usrWords[i]);
			else
			{
				otherIndices.push(i);
				otherWords.push(message.usrWords[i]);
				otherLanguages.push(message.usrLang[i]);
			}
		}

		if (message.usrWords.length === otherWords.length)
		{
			fallback(message);
			return;
		}

		if (0 === otherWords.length)
		{
			let spellResponse = copyMessage(message);
			spellResponse.usrCorrect = [];
			for (let i = 0; i < message.usrWords.length; ++i)
				spellResponse.usrCorrect.push(khmerCorrect[i]);
			spellResponse.usrSuggest = [];
			setTimeout(function() { spellApi.onSpellCheck(spellResponse); }, 0);
			return;
		}

		let requestId = this.nextRequestId++;
		let fallbackMessage = copyMessage(message);
		fallbackMessage.usrWords = otherWords;
		fallbackMessage.usrLang = otherLanguages;
		fallbackMessage[REQUEST_ID] = requestId;
		this.pending[requestId] = {
			"message" : message,
			"khmerCorrect" : khmerCorrect,
			"otherIndices" : otherIndices
		};
		fallback(fallbackMessage);
	};
	CKhmerSpellchecker.prototype.handleResponse = function(response, deliver)
	{
		let requestId = response && response[REQUEST_ID];
		let pending = requestId ? this.pending[requestId] : null;
		if (!pending)
		{
			deliver(response);
			return;
		}

		delete this.pending[requestId];
		let result = copyMessage(pending.message);
		result.usrCorrect = new Array(pending.message.usrWords.length);
		result.usrSuggest = [];
		for (let key in pending.khmerCorrect)
		{
			if (pending.khmerCorrect.hasOwnProperty(key))
				result.usrCorrect[Number(key)] = pending.khmerCorrect[key];
		}
		let fallbackCorrect = response.usrCorrect || [];
		for (let i = 0; i < pending.otherIndices.length; ++i)
			result.usrCorrect[pending.otherIndices[i]] = fallbackCorrect[i];
		deliver(result);
	};
	CKhmerSpellchecker.prototype.wrapSpellCheckApi = function(spellApi, readyCallback)
	{
		if (!spellApi || spellApi.khmerSpellcheckWrapped)
			return;

		let self = this;
		let fallback = spellApi.spellCheck.bind(spellApi);
		let checkDictionary = spellApi.checkDictionary.bind(spellApi);
		let deliver = spellApi.onSpellCheck;

		spellApi.khmerSpellcheckWrapped = true;
		spellApi.checkDictionary = function(lang)
		{
			return self.isKhmerLanguage(lang) || checkDictionary(lang);
		};
		spellApi.spellCheck = function(message)
		{
			self.routeCommand(message, fallback, spellApi);
		};
		spellApi.onSpellCheck = function(response)
		{
			self.handleResponse(response, deliver);
		};

		this.onReady(readyCallback);
		this.init().catch(function() {});
	};

	let khmerSpellchecker = null;
	window["AscCommon"] = window["AscCommon"] || {};
	window["AscCommon"]["KHMER_SPELLCHECK_LCID"] = KHMER_LCID;
	window["AscCommon"]["CKhmerSpellchecker"] = CKhmerSpellchecker;
	window["AscCommon"]["getKhmerSpellchecker"] = function()
	{
		if (!khmerSpellchecker)
			khmerSpellchecker = new CKhmerSpellchecker();
		return khmerSpellchecker;
	};
})(window);
