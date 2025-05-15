import { CinemaFeatureRoutes } from '../../../../video/src/app/CinemaFeatureRoutes'; // Use the path alias

export function CinemaModule() {
  // The CinemaFeatureRoutes component contains its own internal routing.
  // Any specific providers for video would be inside CinemaFeatureRoutes.
  return <CinemaFeatureRoutes />;
}