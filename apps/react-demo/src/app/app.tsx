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
import { CustomRenderer } from './routes/custom-renderer';
import { DynamicPayload } from './routes/dynamic-payload';
import { BeforeSendMessage } from './routes/before-send-message';
import { CustomHeaderDemo } from './routes/custom-header';
import { AutoResetChannel } from './routes/auto-reset-channel';
import { RenderMenu } from './routes/render-menu';
import { HttpErrorDemo } from './routes/http-error';

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
        <Route path="/custom-renderer" element={<CustomRenderer />} />
        <Route path="/dynamic-payload" element={<DynamicPayload />} />
        <Route path="/before-send-message" element={<BeforeSendMessage />} />
        <Route path="/custom-header" element={<CustomHeaderDemo />} />
        <Route path="/auto-reset-channel" element={<AutoResetChannel />} />
        <Route path="/render-menu" element={<RenderMenu />} />
        <Route path="/http-error" element={<HttpErrorDemo />} />
      </Routes>
    </Layout>
  );
}

export default App;
