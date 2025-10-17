import axios from 'axios';
import config from '../../config/config.js';
import extractToken from '../helper/token.helper.js';

const { baseurl } = config;

export async function megacloud({ selectedServer, id }) {
  const epID = id.split('ep=').pop();
  const fallback_1 = 'megaplay.buzz';
  const fallback_2 = 'vidwish.live';

  try {
    const [{ data: sourcesData }] = await Promise.all([
      axios.get(`${baseurl}/ajax/v2/episode/sources?id=${selectedServer.id}`),
    ]);

    const ajaxLink = sourcesData?.link;
    if (!ajaxLink) throw new Error('Missing link in sourcesData');

    const sourceIdMatch = /\/([^/?]+)\?/.exec(ajaxLink);
    const sourceId = sourceIdMatch?.[1];
    if (!sourceId) throw new Error('Unable to extract sourceId from link');

    const baseUrlMatch = ajaxLink.match(/^(https?:\/\/[^/]+(?:\/[^/]+){3})/);
    if (!baseUrlMatch) throw new Error('Could not extract base URL from ajaxLink');
    const baseUrl = baseUrlMatch[1];

    let rawSourceData = {};
    try {
      const token = await extractToken(`${baseUrl}/${sourceId}?k=1&autoPlay=0&oa=0&asi=1`);
      const { data } = await axios.get(`${baseUrl}/getSources?id=${sourceId}&_k=${token}`);
      rawSourceData = data;

      console.log('Raw source data (no decrypt):', rawSourceData);
    } catch (err) {
      console.warn('Primary source failed, trying fallback:', err.message);
      try {
        const fallback = selectedServer.name.toLowerCase() === 'hd-1' ? fallback_1 : fallback_2;

        const { data: html } = await axios.get(
          `https://${fallback}/stream/s-2/${epID}/${selectedServer.type}`,
          { headers: { Referer: `https://${fallback_1}/` } }
        );

        const dataIdMatch = html.match(/data-id=["'](\d+)["']/);
        const realId = dataIdMatch?.[1];
        if (!realId) throw new Error('Could not extract data-id for fallback');

        const { data: fallback_data } = await axios.get(
          `https://${fallback}/stream/getSources?id=${realId}`,
          { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
        );

        rawSourceData = fallback_data;
      } catch (fallbackError) {
        throw new Error('Fallback failed: ' + fallbackError.message);
      }
    }

    // ✅ Dùng luôn dữ liệu từ rawSourceData
    const sourceFile = rawSourceData?.sources?.[0]?.file ?? '';
    const tracks = rawSourceData?.tracks ?? [];
    const intro = rawSourceData?.intro ?? null;
    const outro = rawSourceData?.outro ?? null;

    return {
      id,
      type: selectedServer.type,
      link: { file: sourceFile, type: 'hls' },
      tracks,
      intro,
      outro,
      server: selectedServer.name
    };
  } catch (error) {
    console.error(`Error during megacloud(${id}):`, error.message);
    return null;
  }
}
