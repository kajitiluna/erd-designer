import { BrowserRouter, Route, Routes } from 'react-router-dom';

import './App.css'
import LocalApplicataion from '~/features/LocalApplication';
import GoogleDriveApplication from '~/features/GoogleDriveApplication';

function App() {

  return (
    <BrowserRouter>
      <div className='App'>
        <Routes>
          <Route path='/erd-designer/gdrive/*' element={<GoogleDriveApplication />} />
          <Route path='*' element={<LocalApplicataion />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;