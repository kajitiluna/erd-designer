import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';

import './App.css'
import LocalApplication from '~/features/LocalApplication';
import GoogleDriveApplication from '~/features/GoogleDriveApplication';
import TermsOfServicePanel from '~/features/regal/TermsOfServicePanel';
import PrivacyPolicyPanel from '~/features/regal/PrivacyPolicyPanel';
import VsCodeExtensionApplication from '~/features/VsCodeExtensionApplication';

import erdTheme from '~/components/ErdTheme';

function App() {

  if (window.vscodeApi) {
    return (
      <ThemeProvider theme={erdTheme}>
        <div className='App'>
          <VsCodeExtensionApplication vscodeApi={window.vscodeApi} />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={erdTheme}>
      <BrowserRouter>
        <div className='App'>
          <Routes>
            <Route path='/erd-designer/gdrive/*' element={<GoogleDriveApplication />} />
            <Route path='/erd-designer/terms_of_service' element={<TermsOfServicePanel />} />
            <Route path='/erd-designer/privacy_policy' element={<PrivacyPolicyPanel />} />
            <Route path='*' element={<LocalApplication />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;