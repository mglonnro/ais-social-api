export const getSpotScore = (spot_count) => {
  let points;

  if (!spot_count) {
    points = 100;
  } else if (spot_count === 1) {
    points = 50;
  } else if (spot_count === 2) {
    points = 25;
  } else {
    points = 10;
  }

  return points;
};
