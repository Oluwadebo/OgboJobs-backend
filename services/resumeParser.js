const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');

const extractSkills = (text) => {
  const common = ['JavaScript','Python','React','Node.js','SQL','MongoDB','AWS','Docker','Git','TypeScript',
    'Java','PHP','CSS','HTML','REST API','GraphQL','Redux','Vue','Angular','PostgreSQL','MySQL','Redis',
    'Kubernetes','CI/CD','Agile','Scrum','Excel','Power BI','Tableau','R','MATLAB','TensorFlow','PyTorch'];
  return common.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(text));
};

const extractExperience = (text) => {
  const match = text.match(/(\d+)\+?\s*years?\s*(of)?\s*(experience|exp)/i);
  if (match) return `${match[1]}+ years`;
  return '';
};

const extractText = async (url, mimetype) => {
  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(resp.data);

  if (mimetype === 'application/pdf' || url.endsWith('.pdf')) {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (url.endsWith('.docx') || url.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return '';
};

exports.parseResume = async (fileUrl, mimetype) => {
  try {
    const rawText = await extractText(fileUrl, mimetype);
    const skills = extractSkills(rawText);
    const experience = extractExperience(rawText);

    // Extract education keywords
    const educationMatch = rawText.match(/(Bachelor|Master|PhD|B\.Sc|M\.Sc|MBA|B\.Tech|HND)[^\n]*/i);
    const education = educationMatch ? educationMatch[0].trim() : '';

    return { skills, experience, education, rawText: rawText.substring(0, 5000) };
  } catch (err) {
    console.error('Resume parse error:', err.message);
    return { skills: [], experience: '', education: '', rawText: '' };
  }
};
