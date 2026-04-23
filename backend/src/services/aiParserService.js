/**
 * src/services/aiParserService.js
 * DOCX → HTML → Structured MCQ Parser with Image Extraction
 * 
 * Supports two modes:
 *   1. DOCX structured parsing (mammoth → HTML → regex parse)
 *   2. AI-based extraction fallback (OpenAI GPT-4) for unstructured content
 */

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const OpenAI   = require('openai');
const logger   = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ─── Upload directory for extracted images ──────────────────────── */
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ═══════════════════════════════════════════════════════════════════
   DOCX STRUCTURED PARSER  (Primary — for formatted question docs)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Convert a DOCX buffer to HTML, extracting embedded images to /uploads/
 * Returns { html, imageMap } where imageMap is { contentType → localPath }
 */
const convertDocxToHtml = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const imageMap = {};

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const imgBuffer = await image.read();
          const ext = getImageExtension(image.contentType);
          const filename = `docx-img-${crypto.randomBytes(8).toString('hex')}${ext}`;
          const savePath = path.join(UPLOAD_DIR, filename);

          fs.writeFileSync(savePath, imgBuffer);

          const publicPath = `/uploads/${filename}`;
          imageMap[filename] = publicPath;

          logger.info(`Extracted image: ${filename} (${image.contentType})`);
          return { src: publicPath };
        } catch (err) {
          logger.warn(`Image extraction failed: ${err.message}`);
          return { src: '' };
        }
      }),
    }
  );

  return { html: result.value, imageMap };
};

/**
 * Get file extension from MIME type
 */
const getImageExtension = (contentType) => {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff',
  };
  return map[contentType] || '.png';
};

/**
 * Parse the mammoth-generated HTML into structured MCQ objects.
 * 
 * Expected DOCX format:
 *   Q1: What is this?
 *   [Image]
 *   A. Option1
 *   B. Option2
 *   C. Option3
 *   D. Option4
 *   Answer: B
 */
const parseHtmlToMCQs = (html) => {
  const questions = [];

  // Split HTML into individual paragraphs/blocks
  // mammoth wraps content in <p> tags
  const blocks = html
    .split(/<\/p>/)
    .map(b => b.replace(/<p[^>]*>/g, '').trim())
    .filter(b => b.length > 0);

  let currentQuestion = null;

  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i];
    // Strip ALL html except <img> for text extraction
    const text = raw.replace(/<(?!img)[^>]+>/g, '').trim();

    // ─── Detect question line: Q1:, Q2:, Q.1, 1., 1), etc. ───
    const qMatch = text.match(/^(?:Q\.?\s*\d+[\.\:\)\-]?\s*|(\d+)[\.\)\:\-]\s*)(.*)/i);
    if (qMatch) {
      // Save previous question if complete
      if (currentQuestion && currentQuestion.options.length === 4) {
        questions.push(finalizeMCQ(currentQuestion));
      }
      currentQuestion = {
        questionText: qMatch[2] || qMatch[0].replace(/^(?:Q\.?\s*\d+[\.\:\)\-]?\s*|\d+[\.\)\:\-]\s*)/, '').trim(),
        image: '',
        options: [],
        correctAnswer: '',
      };

      // Check if this block contains an image
      const imgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/);
      if (imgMatch) {
        currentQuestion.image = imgMatch[1];
      }
      continue;
    }

    // ─── Detect standalone image (between question and options) ───
    const imgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch && currentQuestion && !currentQuestion.image) {
      currentQuestion.image = imgMatch[1];
      continue;
    }

    // ─── Detect option line: A., A), a., a), (A), etc. ───
    const optMatch = text.match(/^(?:\(?([A-Da-d])[\.\)\:])\s*(.*)/);
    if (optMatch && currentQuestion) {
      const label = optMatch[1].toUpperCase();
      const optText = optMatch[2].trim();
      // Avoid duplicates
      if (!currentQuestion.options.find(o => o.label === label)) {
        currentQuestion.options.push({ label, text: optText });
      }
      continue;
    }

    // ─── Detect answer line: Answer: B, Ans: B, Correct: B ───
    const ansMatch = text.match(/^(?:Answer|Ans|Correct(?:\s*Answer)?)\s*[\:\-]\s*([A-Da-d])/i);
    if (ansMatch && currentQuestion) {
      currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
      continue;
    }

    // ─── If we're in a question context and text is non-empty, append to question ───
    if (currentQuestion && text.length > 0 && currentQuestion.options.length === 0 && !qMatch) {
      // Could be a multi-line question — append text
      currentQuestion.questionText += ' ' + text;
    }
  }

  // Push the last question
  if (currentQuestion && currentQuestion.options.length === 4) {
    questions.push(finalizeMCQ(currentQuestion));
  }

  return questions;
};

/**
 * Finalize and clean up a parsed MCQ
 */
const finalizeMCQ = (q) => ({
  questionText: q.questionText.trim().substring(0, 1000),
  image: q.image || '',
  options: q.options.map(o => ({
    label: o.label,
    text: o.text.trim().substring(0, 500),
  })),
  correctAnswer: q.correctAnswer || '',
  explanation: '',
  marks: 1,
});

/* ═══════════════════════════════════════════════════════════════════
   AI-BASED EXTRACTION  (Fallback — for unstructured PDFs/docs)
   ═══════════════════════════════════════════════════════════════════ */

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
  image         : q.image || '',
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

/* ─── Extract text from Word (plain text only) ───────────────────── */
const extractWordText = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

/* ─── Chunk text for large PDFs ──────────────────────────────────── */
const chunkText = (text, maxLen = 12000) => {
  const chunks = [];
  let start    = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
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
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_openai_api_key_here')) {
    logger.warn('OpenAI API Key is missing or placeholder. Using Systematic Mock Generator.');
    return {
      content: JSON.stringify(generateMockQuestions(prompt)),
      totalTokens: 0,
      model: 'mock-generator'
    };
  }

  try {
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
  } catch (err) {
    logger.error(`OpenAI Error: ${err.message}. Falling back to mock generator.`);
    return {
      content: JSON.stringify(generateMockQuestions(prompt)),
      totalTokens: 0,
      model: 'mock-generator-fallback'
    };
  }
};

/* ─── Systematic Mock Generator ──────────────────────────────────── */
const generateMockQuestions = (prompt) => {
  const mockDB = [
    {
      questionText: 'Which of the following is a key principle of surgical asepsis?',
      options: [
        { label: 'A', text: 'Cleanliness' },
        { label: 'B', text: 'Sterilization of all items' },
        { label: 'C', text: 'Hand washing only' },
        { label: 'D', text: 'Using gloves for everything' }
      ],
      correctAnswer: 'B',
      explanation: 'Surgical asepsis requires the complete absence of microorganisms.',
      difficulty: 'medium',
      topic: 'Asepsis'
    },
    {
      questionText: 'What is the standard concentration of Lidocaine for local infiltration?',
      options: [
        { label: 'A', text: '0.5% - 1%' },
        { label: 'B', text: '5%' },
        { label: 'C', text: '10%' },
        { label: 'D', text: '20%' }
      ],
      correctAnswer: 'A',
      explanation: 'Lidocaine is typically used at 0.5% to 2% for local infiltration.',
      difficulty: 'hard',
      topic: 'Anesthesia'
    },
    {
      questionText: 'Which suture material is most commonly used for skin closure?',
      options: [
        { label: 'A', text: 'Nylon' },
        { label: 'B', text: 'Chromic Catgut' },
        { label: 'C', text: 'Vicryl' },
        { label: 'D', text: 'Silk' }
      ],
      correctAnswer: 'A',
      explanation: 'Nylon is a non-absorbable monofilament ideal for skin.',
      difficulty: 'medium',
      topic: 'Suturing'
    }
  ];
  return mockDB;
};

/* ─── Parse JSON safely ───────────────────────────────────────────── */
const parseJSON = (raw) => {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    if (Array.isArray(parsed))           return parsed;
    if (Array.isArray(parsed.questions)) return parsed.questions;
    const arr = Object.values(parsed).find(Array.isArray);
    return arr || [];
  } catch (err) {
    logger.warn(`JSON parse failed: ${err.message}`);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN EXPORTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * extractMCQsFromDocx  — PRIMARY: DOCX structured parser with images
 * @param {string} filePath  - Absolute path to the DOCX file
 * @returns {{ questions: MCQ[], meta: object }}
 */
exports.extractMCQsFromDocx = async (filePath) => {
  logger.info(`[DOCX Parser] Starting structured extraction: ${filePath}`);

  const { html, imageMap } = await convertDocxToHtml(filePath);

  if (!html || html.trim().length < 20) {
    throw new Error('DOCX appears to be empty or contains no extractable content.');
  }

  logger.info(`[DOCX Parser] HTML extracted: ${html.length} chars, ${Object.keys(imageMap).length} images`);

  const questions = parseHtmlToMCQs(html);

  logger.info(`[DOCX Parser] Parsed ${questions.length} structured MCQs`);

  return {
    questions,
    meta: {
      model: 'docx-structured-parser',
      totalTokens: 0,
      imagesExtracted: Object.keys(imageMap).length,
      htmlLength: html.length,
    },
  };
};

/**
 * extractMCQsFromDocument  — FALLBACK: AI-based extraction for PDF/unstructured docs
 * @param {string} filePath  - Absolute path to the PDF or Word file
 * @param {string} subject   - Subject name for prompt context
 * @param {number} count     - Number of MCQs to extract (default 20)
 * @returns {{ questions: MCQ[], meta: { model, totalTokens } }}
 */
exports.extractMCQsFromDocument = async (filePath, subject = 'General', count = 20) => {
  logger.info(`Starting MCQ extraction: ${filePath} | subject=${subject} | count=${count}`);

  /* 1. Extract document text */
  let docText;
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    if (ext === '.pdf') {
      docText = await extractPDFText(filePath);
    } else if (ext === '.docx' || ext === '.doc') {
      docText = await extractWordText(filePath);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (err) {
    throw new Error(`Text extraction failed: ${err.message}`);
  }

  if (!docText || docText.trim().length < 100) {
    throw new Error('Document appears to be empty or contains no extractable text.');
  }

  logger.info(`Document text extracted: ${docText.length} characters`);

  /* 2. Chunk if large */
  const chunks       = chunkText(docText);
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
      const shortText = docText.substring(0, 8000);
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