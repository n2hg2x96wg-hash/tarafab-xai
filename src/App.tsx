import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Investments } from './pages/Investments';
import { Portfolio } from './pages/Portfolio';
import { Transactions } from './pages/Transactions';
import { Analytics } from './pages/Analytics';
import { Profile } from './pages/Profile';
import { Support } from './pages/Support';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/support" element={<Support />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
