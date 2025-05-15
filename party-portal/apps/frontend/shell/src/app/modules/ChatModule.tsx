import { ChatFeatureRoutes } from '../../../../chat/src/app/ChatFeatureRoutes'; // Use the path alias

export function ChatModule() {
  // The ChatFeatureRoutes component contains its own WebSocketProvider and internal routing.
  return <ChatFeatureRoutes />;
}