/* Run with: node tools/test_mixed_script_layout.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeItems(text) {
	return Array.from(text, ch => ({
		ch,
		GetCodePoint() { return ch.codePointAt(0); },
		IsText() { return true; }, IsPdfText() { return false; }, IsNBSP() { return false; },
		IsPunctuation() { return false; }, GetFontSlot() { return 1; },
		IsSpaceAfter() { return !!this.wordBreak; },
		SetWordBreakAfter(value) { this.wordBreak = value; },
		SetHyphenAfter(value) { this.hyphen = value; }
	}));
}

const items = makeItems('តាមDocumentខ្មែរ');
const run = {
	GetElement(i) { return items[i]; },
	Get_CompiledPr() { return {Lang: {Val: 1107, EastAsia: 1033, Bidi: 1025}, CS: false}; }
};
const context = {
	Intl, Number, String, Array, Asc: {LigaturesType: {None: 0}},
	AscFonts: {CTextShaper: function(){}, StringShaper: function(){}},
	AscCommon: {
		getKhmerSpellchecker: () => ({
			isReady: () => true,
			isKhmerText: text => /[\u1780-\u17ff]/.test(text),
			wordBreakOpportunities: () => []
		}),
		getKhmerLineBreakEngine: () => 'viterbi'
	},
	AscWord: {}, lcid_enUS: 1033,
	fontslot_Unknown: 0, fontslot_ASCII: 1, fontslot_HAnsi: 2,
	fontslot_EastAsia: 3, fontslot_CS: 4
};
context.window = context;
vm.createContext(context);
function load(file) {
	vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}

load('word/Editor/Paragraph/TextShaper.js');
const shaper = context.AscWord.ParagraphTextShaper;
shaper.Init = () => {};
shaper.HandleRun = () => {};
shaper.FlushWord = () => {};
const paragraph = {
	GetId: () => 'mixed-script-test',
	GetLogicDocument: () => ({
		IsDocumentEditor: () => true,
		GetDocumentSettings: () => ({isHyphenateCaps: () => true})
	}),
	CheckRunContent(callback) { callback(run, 0, items.length); }
};
shaper.Shape(paragraph);
assert.equal(items[2].wordBreak, true, 'Khmer-to-Latin boundary');
assert.equal(items[10].wordBreak, true, 'Latin-to-Khmer boundary');

const dictionaryLanguages = [];
let word = '';
context.AscHyphenation = {
	setLang(lang) { dictionaryLanguages.push(lang); return lang === 1033; },
	addCodePoint(cp) { word += String.fromCodePoint(cp); },
	hyphenate() { return word === 'document' ? [3, 5] : []; },
	clear() { word = ''; }
};
load('word/Editor/Paragraph/TextHyphenator.js');
context.AscWord.TextHyphenator.hyphenate(paragraph);
assert.ok(dictionaryLanguages.includes(1033), 'Latin word uses an English dictionary');
assert.ok(dictionaryLanguages.includes(1107), 'Khmer words retain their language');
assert.equal(items[5].hyphen, true, 'Latin word has a discretionary hyphen');
console.log('Mixed-script line breaks and Latin hyphenation passed');
