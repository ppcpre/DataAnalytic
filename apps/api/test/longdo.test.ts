import { describe, expect, it } from 'vitest';
import { longdoCameraUrl, parseLongdoCameras } from '../src/adapters/longdo.js';

describe('longdo cameras', () => {
  it('builds a per-camera link in the short id form the Longdo page uses', () => {
    expect(longdoCameraUrl('ITICM_BMAMI0294')).toBe('https://traffic.longdo.com/camera?vdo=i294');
    expect(longdoCameraUrl('DOHBHS0016')).toBe('https://traffic.longdo.com/camera?vdo=DOHBHS0016');
  });

  it('keeps cameras in the service provinces with valid coordinates', () => {
    const out = parseLongdoCameras({
      item: [
        { camid: 'DOHBHS0016', title: '(กรุงเทพมหานคร) ถ.วิภาดีรังสิต ดอนเมือง  ขาออก', latitude: '13.92816', longitude: '100.60593', geocode: '103605', organization: 'กรมทางหลวง', link: 'https://camera1.iticfoundation.org/mjpeg.php?camid=PER-3-008_2', imgurl: 'https://camera1.iticfoundation.org/jpeg.cgi?camid=PER-3-008_2' },
        { camid: 'DOHBHS0016', title: 'ซ้ำ', latitude: '13.9', longitude: '100.6', geocode: '103605' },
        { camid: 'X1', title: 'ไม่มีพิกัด', latitude: '', longitude: '', geocode: '120101' },
        { camid: 'X2', title: 'นอกพื้นที่', latitude: '17.2', longitude: '102.3', geocode: '390113' },
        { camid: 'X3', title: '(นนทบุรี) สะพานพระนั่งเกล้า', latitude: '13.83', longitude: '100.49', geocode: '120101', sponsertext: 'มูลนิธิ iTIC', link: 'http://example.org/insecure' },
      ],
    });
    expect(out).toEqual([
      {
        id: 'longdo-DOHBHS0016',
        name: 'ถ.วิภาดีรังสิต ดอนเมือง ขาออก',
        location: { lat: 13.92816, lng: 100.60593, province: '10' },
        owner: 'กรมทางหลวง',
        url: 'https://traffic.longdo.com/camera?vdo=DOHBHS0016',
        via: 'Longdo Traffic',
        streamUrl: 'https://camera1.iticfoundation.org/mjpeg.php?camid=PER-3-008_2',
        imageUrl: 'https://camera1.iticfoundation.org/jpeg.cgi?camid=PER-3-008_2',
        imageCredit: 'มูลนิธิ iTIC',
      },
      expect.objectContaining({ id: 'longdo-X3', name: 'สะพานพระนั่งเกล้า', owner: 'มูลนิธิ iTIC', streamUrl: undefined }),
    ]);
  });

  it('returns an empty list for unexpected shapes', () => {
    expect(parseLongdoCameras(null)).toEqual([]);
    expect(parseLongdoCameras({ item: 'x' })).toEqual([]);
  });
});
