import { ReactElement } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import BotProviderPage from './pages/BotProvider';
import NotFoundPage from './pages/NotFound';

function App(): ReactElement {
  return (
    <Router>
      <Routes>
        <Route path="/ns/:namespace/bot-provider/:bpName" element={<BotProviderPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
