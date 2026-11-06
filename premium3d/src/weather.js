// 实时天气：Open-Meteo（免 key）。注意它的免费接口仅限非商用，
// 商用需买 API 订阅或换和风天气等；正式版也可以直接用 ESP32 端已有的天气数据（桥接 {type:'weather'}）。
export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`;
  const r = await fetch(url);
  const j = await r.json();
  const c = j.current;
  return { temp: Math.round(c.temperature_2m), condition: codeToCondition(c.weather_code), night: c.is_day === 0 };
}

// WMO 天气代码 → 四类
export function codeToCondition(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  if (code >= 2) return 'cloudy';
  return 'sunny';
}
