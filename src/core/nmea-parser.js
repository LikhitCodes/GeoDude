/**
 * NMEA 0183 Parser
 * Parses $GPGGA, $GPRMC, $GPGSV sentences from raw strings
 * Handles partial sentences, corrupt frames, checksum verification
 */

export class NMEAParser {
  constructor() {
    this.buffer = '';
    this.lastFix = null;
  }

  /**
   * Feed raw data (possibly multiple/partial sentences) and return parsed fixes
   * @param {string} raw - Raw NMEA data
   * @returns {Array} Array of parsed data objects
   */
  feed(raw) {
    this.buffer += raw;
    const results = [];

    // Extract complete sentences
    const regex = /\$[A-Z]{2}[A-Z]{3},[^\r\n]*\*[0-9A-Fa-f]{2}/g;
    let match;

    while ((match = regex.exec(this.buffer)) !== null) {
      const sentence = match[0];
      if (this.verifyChecksum(sentence)) {
        const parsed = this.parseSentence(sentence);
        if (parsed) {
          this.lastFix = { ...this.lastFix, ...parsed };
          results.push({ ...this.lastFix });
        }
      }
    }

    // Keep only the unparsed tail in the buffer
    const lastDollar = this.buffer.lastIndexOf('$');
    if (lastDollar > 0) {
      this.buffer = this.buffer.substring(lastDollar);
    }
    // Prevent buffer from growing too large
    if (this.buffer.length > 2048) {
      this.buffer = this.buffer.substring(this.buffer.length - 512);
    }

    return results;
  }

  /**
   * Verify XOR checksum between $ and *
   */
  verifyChecksum(sentence) {
    const starIdx = sentence.lastIndexOf('*');
    if (starIdx < 0) return false;

    const data = sentence.substring(1, starIdx); // between $ and *
    const expected = sentence.substring(starIdx + 1, starIdx + 3);

    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data.charCodeAt(i);
    }

    const computed = checksum.toString(16).toUpperCase().padStart(2, '0');
    return computed === expected.toUpperCase();
  }

  /**
   * Parse a single NMEA sentence
   */
  parseSentence(sentence) {
    const starIdx = sentence.lastIndexOf('*');
    const body = sentence.substring(1, starIdx); // Strip $ and *XX
    const fields = body.split(',');
    const type = fields[0];

    switch (type) {
      case 'GPGGA':
      case 'GNGGA':
        return this.parseGGA(fields);
      case 'GPRMC':
      case 'GNRMC':
        return this.parseRMC(fields);
      case 'GPGSV':
      case 'GNGSV':
        return this.parseGSV(fields);
      default:
        return null;
    }
  }

  /**
   * Parse GGA - Global Positioning System Fix Data
   * $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,...*47
   */
  parseGGA(fields) {
    const lat = this.parseCoord(fields[2], fields[3]);
    const lon = this.parseCoord(fields[4], fields[5]);

    if (lat === null || lon === null) return null;

    return {
      type: 'GGA',
      timestamp: this.parseTime(fields[1]),
      lat,
      lon,
      fix: parseInt(fields[6] || '0', 10),
      satellites: parseInt(fields[7] || '0', 10),
      hdop: parseFloat(fields[8]) || null,
      altitude: parseFloat(fields[9]) || 0,
      altitudeUnit: fields[10] || 'M',
    };
  }

  /**
   * Parse RMC - Recommended Minimum Navigation Information
   * $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,,*6A
   */
  parseRMC(fields) {
    const lat = this.parseCoord(fields[3], fields[4]);
    const lon = this.parseCoord(fields[5], fields[6]);

    if (lat === null || lon === null) return null;

    const speedKnots = parseFloat(fields[7]) || 0;
    const speedKmh = speedKnots * 1.852;
    const speedMs = speedKnots * 0.514444;

    return {
      type: 'RMC',
      timestamp: this.parseTime(fields[1]),
      status: fields[2], // A=active, V=void
      lat,
      lon,
      speedKnots,
      speedKmh,
      speedMs,
      heading: parseFloat(fields[8]) || 0,
      date: fields[9] || '',
    };
  }

  /**
   * Parse GSV - Satellites in View
   */
  parseGSV(fields) {
    return {
      type: 'GSV',
      totalMessages: parseInt(fields[1], 10),
      messageNumber: parseInt(fields[2], 10),
      satellitesInView: parseInt(fields[3], 10),
    };
  }

  /**
   * Convert DDMM.MMMM + direction to decimal degrees
   */
  parseCoord(coordStr, direction) {
    if (!coordStr || !direction) return null;

    const coord = parseFloat(coordStr);
    if (isNaN(coord)) return null;

    // Split degrees and minutes
    const degrees = Math.floor(coord / 100);
    const minutes = coord - degrees * 100;
    let decimal = degrees + minutes / 60;

    if (direction === 'S' || direction === 'W') {
      decimal *= -1;
    }

    return decimal;
  }

  /**
   * Parse HHMMSS.SS time string
   */
  parseTime(timeStr) {
    if (!timeStr || timeStr.length < 6) return null;

    const hours = parseInt(timeStr.substring(0, 2), 10);
    const minutes = parseInt(timeStr.substring(2, 4), 10);
    const seconds = parseFloat(timeStr.substring(4));

    return { hours, minutes, seconds };
  }

  /**
   * Generate a valid NMEA GGA sentence from data
   * Used by the GPS simulator
   */
  static generateGGA(data) {
    const { lat, lon, fix = 1, satellites = 10, hdop = 0.9, altitude = 100 } = data;

    const latStr = NMEAParser.toNMEACoord(Math.abs(lat));
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonStr = NMEAParser.toNMEACoord(Math.abs(lon));
    const lonDir = lon >= 0 ? 'E' : 'W';

    const now = new Date();
    const time = [
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('') + '.00';

    const body = `GPGGA,${time},${latStr},${latDir},${lonStr},${lonDir},${fix},${String(satellites).padStart(2, '0')},${hdop.toFixed(1)},${altitude.toFixed(1)},M,0.0,M,,`;
    const checksum = NMEAParser.computeChecksum(body);

    return `$${body}*${checksum}`;
  }

  /**
   * Generate a valid NMEA RMC sentence from data
   */
  static generateRMC(data) {
    const { lat, lon, speedKnots = 0, heading = 0 } = data;

    const latStr = NMEAParser.toNMEACoord(Math.abs(lat));
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonStr = NMEAParser.toNMEACoord(Math.abs(lon));
    const lonDir = lon >= 0 ? 'E' : 'W';

    const now = new Date();
    const time = [
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('') + '.00';
    const date = [
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCFullYear()).toString().slice(-2),
    ].join('');

    const body = `GPRMC,${time},A,${latStr},${latDir},${lonStr},${lonDir},${speedKnots.toFixed(1)},${heading.toFixed(1)},${date},,`;
    const checksum = NMEAParser.computeChecksum(body);

    return `$${body}*${checksum}`;
  }

  /**
   * Convert decimal degrees to DDMM.MMMM format
   */
  static toNMEACoord(decimal) {
    const degrees = Math.floor(decimal);
    const minutes = (decimal - degrees) * 60;
    return `${String(degrees).padStart(2, '0')}${minutes.toFixed(4).padStart(7, '0')}`;
  }

  /**
   * Compute XOR checksum for a sentence body
   */
  static computeChecksum(body) {
    let checksum = 0;
    for (let i = 0; i < body.length; i++) {
      checksum ^= body.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
  }
}
