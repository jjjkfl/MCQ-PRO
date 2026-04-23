/**
 * src/services/aiParserService.js
 * Extract MCQ questions from PDF using OpenAI GPT-4
 */

const fs      = require('fs');
const path    = require('path');
const pdfParse = require('pdf-parse');
const OpenAI  = require('openai');
const logger  = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ─── MCQ Validation ──────────────────────────────────────────────── */
const isValidMCQ = (q) => {
  if (!q?.questionText || typeof q.questionText !== 'string') return false;
  if (!Array.isArray(q.options) || q.options.length !== 4)    return false;
  if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer))        return false;
  const labels = q.options.map(o => o.label);
  if (!['A', 'B', 'C', 'D'].every(l => labels.includes(l)))   return false;
  return true;
};

/* ─── Sanitize & Normalize ───────────────────────────────────────── */
const sanitizeMCQ = (q, index) => ({
  questionText  : String(q.questionText).trim().substring(0, 1000),
  options       : ['A', 'B', 'C', 'D'].map(label => {
    const opt = q.options.find(o => o.label === label) || { label, text: '' };
    return { label, text: String(opt.text).trim().substring(0, 500) };
  }),
  correctAnswer : q.correctAnswer,
  explanation   : q.explanation ? String(q.explanation).trim().substring(0, 500) : '',
  difficulty    : ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
  topic         : q.topic ? String(q.topic).trim().substring(0, 100) : '',
  marks         : typeof q.marks === 'number' && q.marks > 0 ? Math.min(q.marks, 10) : 1,
  negativeMark  : typeof q.negativeMark === 'number' ? Math.max(0, q.negativeMark) : 0,
});

/* ─── Extract text from PDF ──────────────────────────────────────── */
const extractPDFText = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const data   = await pdfParse(buffer);
  return data.text;
};

/* ─── Chunk text for large PDFs ──────────────────────────────────── */
const chunkText = (text, maxLen = 12000) => {
  const chunks = [];
  let start    = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    /* Try to break at paragraph boundary */
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n\n', end);
      if (lastNewline > start + maxLen / 2) end = lastNewline;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(c => c.length > 100);
};

/* ─── Build extraction prompt ────────────────────────────────────── */
const buildPrompt = (text, subject, targetCount) => `
You are an expert exam question generator specializing in ${subject}.

TASK: Extract or generate exactly ${targetCount} high-quality MCQ questions from the following educational content.

REQUIREMENTS:
1. Each question must have EXACTLY 4 options labeled A, B, C, D
2. Only ONE option is correct
3. Questions must be factual, clear, and unambiguous
4. Cover various difficulty levels (easy/medium/hard)
5. Include the topic/subtopic for each question
6. Provide a brief explanation for the correct answer

CONTENT:
${text}

RESPONSE FORMAT: Return ONLY a valid JSON array. No markdown, no explanation, just the JSON.
[
  {
    "questionText": "What is ...?",
    "options": [
      { "label": "A", "text": "Option A text" },
      { "label": "B", "text": "Option B text" },
      { "label": "C", "text": "Option C text" },
      { "label": "D", "text": "Option D text" }
    ],
    "correctAnswer": "B",
    "explanation": "Brief explanation of why B is correct",
    "difficulty": "medium",
    "topic": "Subtopic name",
    "marks": 1,
    "negativeMark": 0
  }
]

Return exactly ${targetCount} questions or as many as the content supports.
`;

/* ─── Call OpenAI API ─────────────────────────────────────────────── */
const callOpenAI = async (prompt) => {
  const response = await openai.chat.completions.create({
    model      : process.env.OPENAI_MODEL || 'gpt-4o',
    messages   : [
      {
        role   : 'system',
        content: 'You are an expert educational content extractor. Always return valid JSON arrays only. No prose, no markdown fences.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens : 4000,
    response_format: { type: 'json_object' },
  });

  return {
    content    : response.choices[0]?.message?.content || '{}',
    totalTokens: response.usage?.total_tokens || 0,
    model      : response.model,
  };
};

/* ─── Parse JSON safely ───────────────────────────────────────────── */
const parseJSON = (raw) => {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    /* Handle { "questions": [...] } or direct array */
    if (Array.isArray(parsed))           return parsed;
    if (Array.isArray(parsed.questions)) return parsed.questions;
    /* Find first array in object values */
    const arr = Object.values(parsed).find(Array.isArray);
    return arr || [];
  } catch (err) {
    logger.warn(`JSON parse failed: ${err.message}`);
    return [];
  }
};

/* ─── MAIN EXPORT ─────────────────────────────────────────────────── */
/**
 * extractMCQsFromPDF
 * @param {string} filePath  - Absolute path to the PDF
 * @param {string} subject   - Subject name for prompt context
 * @param {number} count     - Number of MCQs to extract (default 20)
 * @returns {{ questions: MCQ[], meta: { model, totalTokens } }}
 */
exports.extractMCQsFromPDF = async (filePath, subject = 'General', count = 20) => {
  logger.info(`Starting MCQ extraction: ${filePath} | subject=${subject} | count=${count}`);

  /* 1. Extract PDF text */
  let pdfText;
  try {
    pdfText = await extractPDFText(filePath);
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${err.message}`);
  }

  if (!pdfText || pdfText.trim().length < 100) {
    throw new Error('PDF appears to be empty or contains no extractable text.');
  }

  logger.info(`PDF text extracted: ${pdfText.length} characters`);

  /* 2. Chunk if large */
  const chunks       = chunkText(pdfText);
  const perChunk     = Math.ceil(count / chunks.length);
  let allQuestions   = [];
  let totalTokens    = 0;
  let lastModel      = process.env.OPENAI_MODEL || 'gpt-4o';

  /* 3. Process each chunk */
  for (let i = 0; i < chunks.length; i++) {
    const needed = Math.min(perChunk, count - allQuestions.length);
    if (needed <= 0) break;

    try {
      logger.info(`Processing chunk ${i + 1}/${chunks.length} — requesting ${needed} questions`);
      const prompt   = buildPrompt(chunks[i], subject, needed);
      const response = await callOpenAI(prompt);

      totalTokens += response.totalTokens;
      lastModel    = response.model;

      const rawQuestions = parseJSON(response.content);
      const valid        = rawQuestions.filter(isValidMCQ).map(sanitizeMCQ);

      allQuestions = [...allQuestions, ...valid];
      logger.info(`Chunk ${i + 1}: extracted ${valid.length} valid questions`);

    } catch (err) {
      logger.warn(`Chunk ${i + 1} failed: ${err.message} — skipping`);
    }

    /* Deduplicate by question text */
    allQuestions = allQuestions.filter(
      (q, idx, arr) => arr.findIndex(x => x.questionText === q.questionText) === idx
    );
  }

  /* 4. Fallback: generate from topic if extraction yielded nothing */
  if (allQuestions.length === 0) {
    logger.warn('No questions extracted from chunks — attempting full-text generation');
    try {
      const shortText = pdfText.substring(0, 8000);
      const prompt    = buildPrompt(shortText, subject, count);
      const response  = await callOpenAI(prompt);
      totalTokens    += response.totalTokens;
      const rawQ      = parseJSON(response.content);
      allQuestions    = rawQ.filter(isValidMCQ).map(sanitizeMCQ);
    } catch (err) {
      throw new Error(`AI extraction completely failed: ${err.message}`);
    }
  }

  /* 5. Trim to requested count */
  allQuestions = allQuestions.slice(0, count);

  logger.info(`MCQ extraction complete: ${allQuestions.length} questions | tokens=${totalTokens}`);

  return {
    questions : allQuestions,
    meta      : { model: lastModel, totalTokens },
  };
};

/* ─── Manual MCQ Creation Validator ──────────────────────────────── */
exports.validateMCQs = (questions) => {
  if (!Array.isArray(questions)) return { valid: false, errors: ['Questions must be an array'] };
  const errors = [];
  questions.forEach((q, i) => {
    if (!isValidMCQ(q)) errors.push(`Question ${i + 1} is invalid or malformed`);
  });
  return { valid: errors.length === 0, errors, count: questions.length };
};