
import { google } from 'googleapis';
import { parse } from 'csv-parse/sync';
import { requireEnv } from './env.js';

function driveClient() {
  requireEnv(
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_FILE_ID'
  );

  let credentials;

  try {
    credentials = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    );
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON must be valid service-account JSON.'
    );
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return google.drive({ version: 'v3', auth });
}

async function streamToString(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
}

export async function loadChannelsFromDrive() {
  const drive = driveClient();
  const fileId = process.env.GOOGLE_DRIVE_FILE_ID;

  // Identify the file type first.
  const metadataResponse = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType'
  });

  const file = metadataResponse.data;
  let csvText;

  if (
    file.mimeType === 'application/vnd.google-apps.spreadsheet'
  ) {
    // Google Sheets must be exported as CSV.
    const response = await drive.files.export(
      {
        fileId,
        mimeType: 'text/csv'
      },
      {
        responseType: 'stream'
      }
    );

    csvText = await streamToString(response.data);
  } else {
    // Regular CSV or other downloadable file.
    const response = await drive.files.get(
      {
        fileId,
        alt: 'media'
      },
      {
        responseType: 'stream'
      }
    );

    csvText = await streamToString(response.data);
  }

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: false,
    trim: true
  });

  if (!rows.length) return [];

  const headers = Object.keys(rows[0]);

  const findHeader = expected =>
    headers.find(
      h => h.trim().toLowerCase() === expected.toLowerCase()
    );

  const channelKey = findHeader('Channel');
  const countryKey = findHeader('Country');
  const urlKey = findHeader('URL');

  if (!channelKey || !countryKey || !urlKey) {
    throw new Error(
      'CSV must contain Channel, Country, URL columns.'
    );
  }

  return rows
    .map((row, index) => {
      const title = String(row[channelKey] || '').trim();
      const country = String(row[countryKey] || '').trim();
      const url = String(row[urlKey] || '').trim();

      if (!title || !url) return null;

      let parsedUrl;

      try {
        parsedUrl = new URL(url);
      } catch {
        return null;
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return null;
      }

      return {
        id: `channel-${index + 1}`,
        title,
        country: country || 'Unknown',
        url,
        type: 'live'
      };
    })
    .filter(Boolean);
}
