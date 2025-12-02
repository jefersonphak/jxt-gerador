const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) { console.error('Erro ao inicializar o Firebase Admin:', error); }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  const { httpMethod, path, body } = event;
  const keyId = path.split('/').pop();
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
  if (httpMethod === 'OPTIONS') { return { statusCode: 200, headers, body: '' }; }
  try {
    switch (httpMethod) {
      case 'GET': return await getKeys();
      case 'POST': return await createKey(JSON.parse(body));
      case 'PUT': return await updateKey(keyId, JSON.parse(body));
      case 'DELETE': return await deleteKey(keyId);
      default: return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }
  } catch (error) { console.error('Erro na API:', error); return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }; }
};

async function getKeys() {
  const snapshot = await db.collection('keys').orderBy('createdAt', 'desc').get();
  const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(keys) };
}

async function createKey(data) {
  const { name, duration, owner } = data;
  const now = admin.firestore.Timestamp.now();
  const expiresAt = new Date(now.toDate().getTime() + duration * 24 * 60 * 60 * 1000);
  const newKeyRef = db.collection('keys').doc();
  const keyId = `${name}-${duration}d-${newKeyRef.id.slice(-6)}`;
  await newKeyRef.set({ keyId, name, owner, duration, status: 'active', createdAt: now, expiresAt: admin.firestore.Timestamp.fromDate(expiresAt) });
  return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Key criada com sucesso!', keyId }) };
}

async function updateKey(keyId, data) {
  const { action } = data;
  const keyRef = db.collection('keys').doc(keyId);
  const keyDoc = await keyRef.get();
  if (!keyDoc.exists) { return { statusCode: 404, body: JSON.stringify({ error: 'Key não encontrada' }) }; }
  const currentData = keyDoc.data();
  let updateData = {};
  switch (action) {
    case 'reset': const newExpiresAt = new Date(admin.firestore.Timestamp.now().toDate().getTime() + currentData.duration * 24 * 60 * 60 * 1000); updateData = { status: 'active', expiresAt: admin.firestore.Timestamp.fromDate(newExpiresAt), frozenAt: null }; break;
    case 'freeze': if (currentData.status === 'active') { updateData = { status: 'frozen', frozenAt: admin.firestore.Timestamp.now() }; } break;
    case 'unfreeze': if (currentData.status === 'frozen' && currentData.frozenAt) { const frozenTime = currentData.frozenAt.toDate().getTime(); const now = admin.firestore.Timestamp.now().toDate().getTime(); const timeElapsed = now - frozenTime; const newExpiry = new Date(currentData.expiresAt.toDate().getTime() + timeElapsed); updateData = { status: 'active', expiresAt: admin.firestore.Timestamp.fromDate(newExpiry), frozenAt: null }; } break;
    default: return { statusCode: 400, body: JSON.stringify({ error: 'Ação inválida' }) };
  }
  await keyRef.update(updateData);
  return { statusCode: 200, body: JSON.stringify({ message: `Key ${action} com sucesso!` }) };
}

async function deleteKey(keyId) {
  await db.collection('keys').doc(keyId).delete();
  return { statusCode: 200, body: JSON.stringify({ message: 'Key apagada com sucesso!' }) };
}