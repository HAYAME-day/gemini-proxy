const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const GEMINI_API_BASE = 'generativelanguage.googleapis.com';

function getApiKey(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

async function geminiRequest(path, method, apiKey, body) {
  return new Promise((resolve, reject) => {
    const fullPath = `${path}?key=${apiKey}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: GEMINI_API_BASE,
      port: 443,
      path: fullPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const apiKey = getApiKey(req);

  // 模型列表
  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    const result = await geminiRequest('/v1beta/models', 'GET', apiKey, null);
    const parsed = JSON.parse(result.body);
    const models = (parsed.models || [])
      .filter(m => m.name.includes('gemini'))
      .map(m => ({
        id: m.name.replace('models/', ''),
        object: 'model',
        created: 0,
        owned_by: 'google',
      }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: models }));
    return;
  }

  // 聊天补全
  if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const input = JSON.parse(body);
      const modelId = input.model || 'gemini-2.0-flash';
      const stream = input.stream || false;

      const systemMessages = input.messages.filter(m => m.role === 'system');
const nonSystemMessages = input.messages.filter(m => m.role !== 'system');

const systemPrompt = systemMessages.map(m => m.content).join('\n');

const contents = nonSystemMessages.map(m => ({
  role: m.role === 'assistant' ? 'model' : 'user',
  parts: [{ text: m.content }],
}));

if (systemPrompt && contents.length > 0) {
  contents[0].parts[0].text = systemPrompt + '\n\n' + contents[0].parts[0].text;
}

      const geminiBody = { contents };

      if (stream) {
        const result = await geminiRequest(
          `/v1beta/models/${modelId}:streamGenerateContent`,
          'POST', apiKey, geminiBody
        );
        // 简化处理：非流式返回
        const parsed = JSON.parse(result.body);
        console.log('Gemini response:', result.body);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const response = {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } else {
        const result = await geminiRequest(
          `/v1beta/models/${modelId}:generateContent`,
          'POST', apiKey, geminiBody
        );
        const parsed = JSON.parse(result.body);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const response = {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Gemini OpenAI proxy running on port ${PORT}`);
});
