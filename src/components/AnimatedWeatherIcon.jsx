import { useEffect, useState } from "react";
import clearDay from "@meteocons/svg/fill/clear-day.svg";
import clearNight from "@meteocons/svg/fill/clear-night.svg";
import cloudy from "@meteocons/svg/fill/cloudy.svg";
import extremeDayRain from "@meteocons/svg/fill/extreme-day-rain.svg";
import extremeNightRain from "@meteocons/svg/fill/extreme-night-rain.svg";
import hazeDay from "@meteocons/svg/fill/haze-day.svg";
import hazeNight from "@meteocons/svg/fill/haze-night.svg";
import notAvailable from "@meteocons/svg/fill/not-available.svg";
import overcastDay from "@meteocons/svg/fill/overcast-day.svg";
import partlyCloudyDay from "@meteocons/svg/fill/partly-cloudy-day.svg";
import partlyCloudyNight from "@meteocons/svg/fill/partly-cloudy-night.svg";
import rain from "@meteocons/svg/fill/rain.svg";
import thunderstormsDayRain from "@meteocons/svg/fill/thunderstorms-day-rain.svg";
import thunderstormsNightRain from "@meteocons/svg/fill/thunderstorms-night-rain.svg";
import wind from "@meteocons/svg/fill/wind.svg";
import { Icon } from "../design-system";

const METEOCONS = {
  "cloud-lightning": thunderstormsDayRain,
  "cloud-lightning-night": thunderstormsNightRain,
  "cloud-rain-wind": extremeDayRain,
  "cloud-rain-wind-night": extremeNightRain,
  "cloud-rain": rain,
  "cloud-fog": hazeDay,
  "cloud-fog-night": hazeNight,
  wind,
  "cloud-sun": partlyCloudyDay,
  "cloud-moon": partlyCloudyNight,
  cloud: overcastDay,
  cloudy,
  sun: clearDay,
  moon: clearNight,
  "cloud-off": notAvailable,
};

export function AnimatedWeatherIcon({ name, size = 24, className, style }) {
  const [failed, setFailed] = useState(false);
  const source = METEOCONS[name];

  useEffect(() => setFailed(false), [name]);

  if (!source || failed) {
    return <Icon name={name} size={size} className={className} style={style} />;
  }

  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      className={className}
      data-weather-icon={name}
      onError={() => setFailed(true)}
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, objectFit: "contain", flex: "none", ...style }}
    />
  );
}
