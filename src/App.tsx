import { BrowserRouter, Route, Routes } from 'react-router-dom';

import './App.css'
import LocalApplicataion from '~/features/LocalApplication';
import GoogleDriveApplication from '~/features/GoogleDriveApplication';
import TermsOfServicePanel from '~/features/regal/TermsOfServicePanel';
import PrivacyPolicyPanel from '~/features/regal/PrivacyPolicyPanel';

function App() {

  return (
    <BrowserRouter>
      <div className='App'>
        <Routes>
          <Route path='/erd-designer/gdrive/*' element={<GoogleDriveApplication />} />
          <Route path='/erd-designer/terms_of_service' element={<TermsOfServicePanel />} />
          <Route path='/erd-designer/privacy_policy' element={<PrivacyPolicyPanel />} />
          <Route path='*' element={<LocalApplicataion />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;