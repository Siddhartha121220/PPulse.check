import { Platform } from 'react-native';

export class DeviceInfoService {
  /**
   * Returns the device model name (e.g. CPH2381, Pixel 6, or iPhone).
   */
  static getDeviceModel(): string {
    if (Platform.OS === 'android') {
      const constants = Platform.constants as any;
      const brand = constants.Brand || '';
      const model = constants.Model || 'Unknown Android';
      return brand ? `${brand} ${model}` : model;
    } else if (Platform.OS === 'ios') {
      // iOS doesn't expose the model string directly in Platform.constants,
      // but we can provide a friendly fallback.
      return 'Apple Device';
    }
    return 'Unknown Device';
  }

  /**
   * Returns the operating system version.
   */
  static getOSVersion(): string {
    return `${Platform.OS} ${Platform.Version}`;
  }
}
