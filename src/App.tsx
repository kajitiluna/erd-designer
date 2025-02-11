import { BrowserRouter, Route, Routes } from 'react-router-dom';

import './App.css'
import GoogleDriveApplication from '~/features/GoogleDriveApplication';
import LocalApplicataion from '~/features/LocalApplication';

function App() {

  return (
    <BrowserRouter>
      <div className='App'>
        <Routes>
          <Route path='/gdrive/*' element={<GoogleDriveApplication />} />
          <Route path='*' element={<LocalApplicataion />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;