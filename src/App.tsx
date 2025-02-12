import { BrowserRouter, Route, Routes } from 'react-router-dom';

import './App.css'
import LocalApplicataion from '~/features/LocalApplication';
import GoogleOAuthProviderWrapper from '~/features/gdrive/GoogleOAuthProviderWrapper';

function App() {

  return (
    <BrowserRouter>
      <div className='App'>
        <Routes>
          <Route path='/erd-designer/gdrive/*' element={<GoogleOAuthProviderWrapper />} />
          <Route path='*' element={<LocalApplicataion />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;