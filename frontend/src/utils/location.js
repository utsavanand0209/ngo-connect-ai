export const getNgoCoordinates = (ngo) => {
  const coordinates = ngo?.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

export const getCampaignCoordinates = (campaign) => {
  const direct = campaign?.coordinates;
  if (direct && Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) {
    return { lat: direct.lat, lng: direct.lng };
  }
  return getNgoCoordinates(campaign?.ngo);
};

export const buildDirectionsUrl = ({ lat, lng, origin } = {}) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

  const destination = `${lat},${lng}`;
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
};

export const getNgoLocationText = (ngo) => {
  const fromAddress = String(ngo?.address || '').trim();
  if (fromAddress) return fromAddress;

  const areaTokens = [ngo?.addressDetails?.landmark, ngo?.addressDetails?.district, ngo?.addressDetails?.state]
    .filter(Boolean)
    .map((token) => String(token).trim());

  if (areaTokens.length > 0) return areaTokens.join(', ');
  if (Array.isArray(ngo?.geographies) && ngo.geographies.length > 0) return ngo.geographies.join(', ');
  return 'Location not specified';
};

export const getCampaignLocationText = (campaign) => {
  const fromLocation = String(campaign?.location || '').trim();
  if (fromLocation) return fromLocation;
  return getNgoLocationText(campaign?.ngo || {});
};

