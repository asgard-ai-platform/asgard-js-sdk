import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout';
import { Home } from './routes/home';
import { Templates } from './routes/templates';
import { Features } from './routes/features';
import { Theme } from './routes/theme';
import { Auth } from './routes/auth';
import { Events } from './routes/events';
import { Fullscreen } from './routes/fullscreen';
import { Markdown } from './routes/markdown';
import { Private } from './routes/private';

export function App(): React.ReactElement {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/features" element={<Features />} />
        <Route path="/theme" element={<Theme />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/events" element={<Events />} />
        <Route path="/fullscreen" element={<Fullscreen />} />
        <Route path="/markdown" element={<Markdown />} />
        <Route path="/private" element={<Private />} />
      </Routes>
    </Layout>
  );
}

export default App;
