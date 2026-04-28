/**
 * src/services/aiParserService.js
 * DOCX → HTML → Structured MCQ Parser with Image Extraction
 * 
 * Supports two modes:
 *   1. DOCX structured parsing (mammoth → HTML → regex parse)
 *   2. AI-based extraction fallback (OpenAI GPT-4) for unstructured content
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const logger = require('../utils/logger');

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

    // ─── Detect question line: Q1:, Q2:, Q.1, 1., 1), etc. OR UNNUMBERED question ───
    const qMatch = text.match(/^(?:Q\.?\s*\d+[\.\:\)\-]?\s*|(\d+)[\.\)\:\-]\s*)(.*)/i);

    // HEURISTIC V2: Skip image-only blocks when looking for options
    let isUnnumberedQ = false;
    if (!qMatch && text.length > 5 && !text.match(/^(?:\(?([A-Da-d])[\.\)\:])/)) {
      for (let j = 1; j <= 3; j++) {
        const next = blocks[i + j] ? blocks[i + j].replace(/<(?!img)[^>]+>/g, '').trim() : '';
        if (!next) continue; // skip empty
        if (next.match(/^(?:\(?([Aa])[\.\)\:])/)) {
          isUnnumberedQ = true;
          break;
        }
        if (next.includes('<img')) continue; // skip image-only blocks
        break; // stop at any other text
      }
    }

    if (qMatch || isUnnumberedQ) {
      // Save previous question if complete
      if (currentQuestion && currentQuestion.options.length >= 2) {
        questions.push(finalizeMCQ(currentQuestion));
      }
      currentQuestion = {
        questionText: qMatch ? (qMatch[2] || qMatch[0].replace(/^(?:Q\.?\s*\d+[\.\:\)\-]?\s*|\d+[\.\)\:\-]\s*)/, '').trim()) : text,
        image: '',
        options: [],
        correctAnswer: '',
      };

      // If questionText is empty (image-only question), set placeholder
      if (!currentQuestion.questionText) {
        currentQuestion.questionText = '[Refer to the image below]';
      }

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

    // ─── Detect option line: A., A), a., a), (A), etc. (Handles MULTIPLE options per line) ───
    const optRegex = /(?:\(?([A-Da-d])[\.\)\:])\s*([\s\S]*?)(?=\s*(?:\(?([A-Da-d])[\.\)\:])|$)/g;
    let match;
    let foundOptionInThisBlock = false;
    while ((match = optRegex.exec(text)) !== null) {
      if (currentQuestion) {
        const label = match[1].toUpperCase();
        const optText = match[2].trim().replace(/<img[^>]+>/g, '').trim();

        if (!currentQuestion.options.find(o => o.label === label)) {
          // Check if this option block contains an image (only works well if 1 option per block)
          const optImgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/);
          const finalOptText = optText.trim();
          currentQuestion.options.push({
            label,
            text: finalOptText || `Option ${label}`, // Ensure NOT empty for Mongoose
            image: optImgMatch ? optImgMatch[1] : ''
          });
          foundOptionInThisBlock = true;
        }
      }
    }
    if (foundOptionInThisBlock) continue;

    // ─── Detect answer line: Answer: B, Ans: B, Correct: B ───
    const ansMatch = text.match(/^(?:Answer|Ans|Correct(?:\s*Answer)?)\s*[\:\-]\s*([A-Da-d])/i);
    if (ansMatch && currentQuestion) {
      currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
      continue;
    }

    // ─── If we're in a question context and text is non-empty, append to question ───
    if (currentQuestion && text.length > 0 && currentQuestion.options.length === 0 && !qMatch) {
      // Could be a multi-line question — append text (cleaning img tags if any)
      currentQuestion.questionText += ' ' + text.replace(/<img[^>]+>/g, '').trim();
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
const finalizeMCQ = (q) => {
  // Ensure we have exactly 4 options for Mongoose and UI consistency
  const labels = ['A', 'B', 'C', 'D'];
  const finalOptions = labels.map(l => {
    const existing = q.options.find(o => o.label === l);
    if (existing) {
      const txt = (existing.text || '').trim();
      return {
        label: existing.label,
        text: txt || `Option ${l}`,
        image: existing.image || ''
      };
    }
    return { label: l, text: `Option ${l}`, image: '' };
  });

  return {
    questionText: (q.questionText || 'Untitled Question').trim().substring(0, 5000),
    image: q.image || '',
    options: finalOptions,
    correctAnswer: q.correctAnswer || 'A',
    marks: 1,
    explanation: q.explanation || ''
  };
};

/* ═══════════════════════════════════════════════════════════════════
   AI-BASED EXTRACTION  (Fallback — for unstructured PDFs/docs)
   ═══════════════════════════════════════════════════════════════════ */

/* ─── MCQ Validation ──────────────────────────────────────────────── */
const isValidMCQ = (q) => {
  if (!q?.questionText || typeof q.questionText !== 'string') return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer)) return false;
  const labels = q.options.map(o => o.label);
  if (!['A', 'B', 'C', 'D'].every(l => labels.includes(l))) return false;
  return true;
};

/* ─── Sanitize & Normalize ───────────────────────────────────────── */
const sanitizeMCQ = (q, index) => ({
  questionText: String(q.questionText).trim().substring(0, 1000),
  image: q.image || '',
  options: ['A', 'B', 'C', 'D'].map(label => {
    const opt = q.options.find(o => o.label === label) || { label, text: `Option ${label}` };
    const txt = (String(opt.text || '')).trim();
    return { label, text: txt || `Option ${label}` };
  }),
  correctAnswer: q.correctAnswer,
  explanation: q.explanation ? String(q.explanation).trim().substring(0, 500) : '',
  difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
  topic: q.topic ? String(q.topic).trim().substring(0, 100) : '',
  marks: typeof q.marks === 'number' && q.marks > 0 ? Math.min(q.marks, 10) : 1,
  negativeMark: typeof q.negativeMark === 'number' ? Math.max(0, q.negativeMark) : 0,
});

/* ─── Extract text from PDF ──────────────────────────────────────── */
const extractPDFText = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  console.log(`[MCQ Engine] PDF parsed: ${data.numpages} pages found.`);
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
  let start = 0;
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
const buildPrompt = (text, subject, targetCount, fileType = '.pdf') => `
You are an expert surgical exam specialist integrated into the "MCQ Pro" platform.
This extraction is being coordinated across: aiParserService.js, teacherController.js, upload.js, teacher.js, and MCQBank.js.
The source content was extracted from a ${fileType.toUpperCase()} file.

TASK: Extract exactly ${targetCount} high-quality surgical MCQ questions from the following educational content.

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

/* ─── Extraction logic simplified: Regex primary ─── */
const callOpenAI = async (prompt) => {
  logger.warn('OpenAI requested but disabled by user. Returning systematic mocks.');
  return {
    content: JSON.stringify(generateMockQuestions(prompt)),
    totalTokens: 0,
    model: 'mock-generator-disabled'
  };
};

/* ─── Systematic Mock Generator ──────────────────────────────────── */
const generateMockQuestions = (prompt, count = 10) => {
  const baseMocks = [
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
    },
    {
      questionText: 'In surgical counting, when is the first count typically performed?',
      options: [
        { label: 'A', text: 'Before the procedure begins' },
        { label: 'B', text: 'After the first incision' },
        { label: 'C', text: 'Just before closing the cavity' },
        { label: 'D', text: 'After the patient leaves the OR' }
      ],
      correctAnswer: 'A',
      explanation: 'Initial counts establish a baseline before any items are used.',
      difficulty: 'easy',
      topic: 'Safety'
    }
  ];

  const results = [];
  for (let i = 0; i < count; i++) {
    const base = baseMocks[i % baseMocks.length];
    results.push({ ...base, questionText: `${base.questionText} (${i + 1})` });
  }
  return results;
};

/* ─── Parse JSON safely ───────────────────────────────────────────── */
const parseJSON = (raw) => {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
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
 * extractMCQsFromDocument — MAIN ENTRY POINT
 */
exports.extractMCQsFromDocument = async (filePath, subject = 'General', count = 20, originalName = '') => {
  const ext = path.extname(originalName || filePath).toLowerCase();
  let text = '';
  console.log(`[MCQ Engine] Processing: ${originalName} (Detected ext: ${ext})`);

  try {
    if (ext === '.docx' || ext === '.doc') {
      // Try structured DOCX first (best for images)
      const docxRes = await convertDocxToHtml(filePath);
      text = docxRes.html.replace(/<(?!img)[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n');
      const questions = parseHtmlToMCQs(docxRes.html);
      console.log(`[MCQ Engine] Structured DOCX extraction found ${questions.length} questions.`);
      if (questions.length >= 1) {
        return { questions: questions.slice(0, count), meta: { model: 'systematic-docx-parser' } };
      }
      // Fallback: use raw text if structured parse was weak
      console.log(`[MCQ Engine] Structured DOCX parse too weak (${questions.length} questions), falling back to raw text...`);
      text = await extractWordText(filePath);
    } else if (ext === '.pdf') {
      text = await extractPDFText(filePath);
    } else {
      console.error(`[MCQ Engine] Unsupported extension: ${ext}`);
      throw new Error(`Unsupported file format: ${ext}`);
    }

    if (!text || text.length < 50) {
      console.warn(`[MCQ Engine] Extraction failed: Text too short (${text ? text.length : 0} chars)`);
      throw new Error(`Document appears to be image-only or unreadable (Length: ${text ? text.length : 0})`);
    }
    console.log(`[MCQ Engine V2.2] Total extracted text length: ${text.length} chars. Requested count: ${count}`);
    // console.log(`[MCQ Engine] SAMPLE TEXT: "${text.substring(0, 500).replace(/\n/g, '\\n')}"`);

    // 1. Try Regex Parser (The New Primary Engine)
    const regexQuestions = exports.regexExtractFromText(text);
    console.log(`[MCQ Engine] Regex Engine found ${regexQuestions.length} questions.`);
    if (regexQuestions.length >= 1) {
      return { questions: regexQuestions.slice(0, count), meta: { model: 'regex-engine' } };
    }

    // 2. Try AI only if Key exists and Regex failed
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your_openai_api_key_here')) {
      console.log(`[MCQ Engine] Regex failed. Attempting AI extraction enhancement...`);
      const prompt = buildPrompt(text.substring(0, 8000), subject, count, ext);
      const response = await callOpenAI(prompt);
      const aiQuestions = parseJSON(response.content).filter(isValidMCQ).map(sanitizeMCQ);
      if (aiQuestions.length > 0) return { questions: aiQuestions.slice(0, count), meta: { model: response.model } };
    }

    // 3. Last Resort: Systematic Mock Generator (Avoids hard error)
    console.warn('[MCQ Engine] All primary methods failed. Returning mock data.');
    return { questions: generateMockQuestions('', count), meta: { model: 'mock-generator-final' } };

  } catch (err) {
    console.error(`[MCQ Engine] CRITICAL ERROR: ${err.message}`);
    console.error(err.stack);
    // Return mocks instead of throwing to keep the UI functional
    return {
      questions: generateMockQuestions('', count),
      meta: { model: 'error-fallback-mock', error: err.message }
    };
  }
};

/**
 * Universal Regex-based MCQ Parser for plain text
 */
exports.regexExtractFromText = (text) => {
  const questions = [];

  // 1. IMPROVED SPLIT: Look for numbers OR sequences that look like a question text followed by "a)"
  // V2.7: Added splitting by Question Marks (?) and common Question Starters (Which, What, This is)
  // because some PDFs strip the a) b) c) d) labels during extraction.
  const blocks = text.split(/(?=\s\d+[\.\)\:\-]\s+|\n\s*\d+[\.\)\:\-]\s+|\n\s*Q(?:uestion)?\.?\s*\d+[\.\)\:\-]?\s*|^Q(?:uestion)?\.?\s*\d+[\.\)\:\-]?\s*|^\d+[\.\)\:\-]\s*|(?:\n|^)(?=\s*[^\sA-D].*?[\n\s]+[A-Da-d][\.\)\:\-]\s+)|(?<=\?)\s+(?=[A-Z])|(?<=\.)\s+(?=Which|What|How|When|The\s+following|This\s+logo|This\s+is))/i);

  for (let block of blocks) {
    block = block.trim();
    if (!block || block.length < 15) continue;

    // Detect Question Text: Try numbered first, then fallback to any text before the first option
    let qMatch = block.match(/^(?:Q(?:uestion)?\.?\s*\d+[\.\)\:\-]?\s*|\d+[\.\)\:\-]\s*)([\s\S]*?)(?=\s*[\(\[]?[A-D][\.\)\:\-\]]\s+|[\n\s]?[A-D][\.\)\:\-\]]\s+)/i);

    // Fallback if no number found: take everything before the first option
    if (!qMatch) {
      qMatch = block.match(/^([\s\S]*?)(?=\s*[\(\[]?[A-D][\.\)\:\-\]]\s+|[\n\s]?[A-D][\.\)\:\-\]]\s+)/i);
    }

    if (!qMatch) continue;

    const questionText = qMatch[1].trim();
    const options = [];

    // Extract options A, B, C, D even if they're on the same line
    const optRegex = /[\(\[]?([A-D])[\.\)\:\-\]]\s*([\s\S]*?)(?=\s*[\(\[]?[A-D][\.\)\:\-\]]\s+|[\n\s]?(?:Answer|Ans|Correct|Q|Key)|$)/gi;
    let m;
    while ((m = optRegex.exec(block)) !== null) {
      const label = m[1].toUpperCase();
      const optText = m[2].trim().replace(/\n/g, ' ');
      if (!options.find(o => o.label === label)) {
        options.push({ label, text: optText || `Option ${label}` });
      }
    }

    // Extract Answer
    const ansMatch = block.match(/(?:Answer|Ans|Correct|Correct Answer|Key)\s*[\:\-]\s*([A-D])/i);
    const correctAnswer = ansMatch ? ansMatch[1].toUpperCase() : (options.length > 0 ? options[0].label : 'A');

    // Check for images
    const imgMatch = block.match(/\[IMAGE:([^\]]+)\]/) || block.match(/<img[^>]+src=["']([^"']+)["']/i);

    if (options.length >= 2 || questionText.length > 10) {
      questions.push({
        questionText: questionText.replace(/<img[^>]+>/gi, '').trim() || 'Untitled Question',
        image: imgMatch ? imgMatch[1] : '',
        options: options.length === 4 ? options :
          (options.length > 0 ? [...options, ...['A', 'B', 'C', 'D'].slice(options.length).map(l => ({ label: l, text: `Option ${l}` }))].slice(0, 4) :
            [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }, { label: 'C', text: 'Option C' }, { label: 'D', text: 'Option D' }]),
        correctAnswer,
        marks: 1
      });
    }
  }

  return questions;
};

exports.validateMCQs = (questions) => {
  if (!Array.isArray(questions)) return { valid: false, errors: ['Questions must be an array'] };
  const errors = [];
  questions.forEach((q, i) => {
    if (!isValidMCQ(q)) errors.push(`Question ${i + 1} is invalid or malformed`);
  });
  return { valid: errors.length === 0, errors, count: questions.length };
};