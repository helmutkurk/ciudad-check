import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// API bbox order is west,south,east,north; zoom is an integer in [0, 20].
Map<String, String> clusterQueryParameters({
  required LatLng southWest,
  required LatLng northEast,
  required double zoom,
}) => {
  'bbox':
      '${southWest.longitude},${southWest.latitude},${northEast.longitude},${northEast.latitude}',
  'zoom': '${zoom.round().clamp(0, 20)}',
};

/// Map zoom levels subtracted before asking for clusters. The server grid cell
/// is 360 / 2^(zoom+4) degrees, only 16 px on screen at the map's own zoom;
/// 3 levels out makes it 128 px, so cluster pins sit well apart.
const clusterZoomOffset = 3;

/// The zoom sent to `GET /api/reports/clusters` for a map at [mapZoom].
int clusterRequestZoom(double mapZoom) =>
    (mapZoom.round() - clusterZoomOffset).clamp(0, 20);

/// Edges of the server grid cell that holds [position] when clusters were
/// requested at [zoom] (contract v0.5: cells of 360 / 2^(zoom+4) degrees,
/// anchored at longitude -180 and latitude -90). A cluster's position is the
/// mean of its reports, so it always lies inside its own cell.
({LatLng southWest, LatLng northEast}) clusterCell(LatLng position, int zoom) {
  final size = 360 / math.pow(2, zoom + 4);
  final x = ((position.longitude + 180) / size).floor();
  final y = ((position.latitude + 90) / size).floor();
  return (
    southWest: LatLng(
      math.max(-90, y * size - 90),
      math.max(-180, x * size - 180),
    ),
    northEast: LatLng(
      math.min(90, (y + 1) * size - 90),
      math.min(180, (x + 1) * size - 180),
    ),
  );
}
