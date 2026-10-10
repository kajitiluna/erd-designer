import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';

import './App.css'
import LocalApplication from '~/features/LocalApplication';
import GoogleDriveApplication from '~/features/GoogleDriveApplication';
import TermsOfServicePanel from '~/features/regal/TermsOfServicePanel';
import PrivacyPolicyPanel from '~/features/regal/PrivacyPolicyPanel';
import VsCodeExtensionApplication from '~/features/VsCodeExtensionApplication';

import erdTheme from '~/components/ErdTheme';
import ThemePreferenceProvider from '~/components/theme/ThemePreferenceProvider';
import { BrowserPreferenceStore, BrowserSystemThemeResolver } from '~/components/theme/BrowserTheme';
import { VsCodePreferenceStore, VsCodeSystemThemeResolver } from '~/components/theme/VsCodeTheme';

const App = () => {

  if (window.vscodeApi) {
    return <VsCodeApp vscodeApi={window.vscodeApi} />;
  }

  return <BrowserApp />;
}

const BrowserApp = () => {
  const store = React.useMemo(() => new BrowserPreferenceStore(), []);
  const resolver = React.useMemo(() => new BrowserSystemThemeResolver(), []);

  return (
    <ThemeProvider theme={erdTheme} defaultMode="light" storageManager={null}>
      <ThemePreferenceProvider store={store} resolver={resolver}>
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
      </ThemePreferenceProvider>
    </ThemeProvider>
  );
};

type VsCodeAppProps = {
  vscodeApi: VsCodeApi
};

const VsCodeApp = ({ vscodeApi }: VsCodeAppProps) => {
  const store = React.useMemo(() => new VsCodePreferenceStore(vscodeApi), [vscodeApi]);
  const resolver = React.useMemo(() => new VsCodeSystemThemeResolver(), []);

  return (
    // mode の保存は ThemePreferenceProvider の Store に一本化するため、MUI 側の localStorage 保存は無効にする
    <ThemeProvider theme={erdTheme} defaultMode="light" storageManager={null}>
      <ThemePreferenceProvider store={store} resolver={resolver}>
        <div className='App'>
          <VsCodeExtensionApplication vscodeApi={vscodeApi} />
        </div>
      </ThemePreferenceProvider>
    </ThemeProvider>
  );
}

export default App;