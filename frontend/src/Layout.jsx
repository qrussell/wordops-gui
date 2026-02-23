// In src/App.jsx (or similar)
import { ConsoleProvider } from './context/ConsoleContext';
import ConsoleModal from './components/ConsoleModal';

const App = () => {
  return (
    <ConsoleProvider> {/* 1. Wrap Provider */}
      <Router>
        {/* ... your routes ... */}
        <Layout>
          <Routes>...</Routes>
        </Layout>
        
        <ConsoleModal /> {/* 2. Add Modal at root level */}
      </Router>
    </ConsoleProvider>
  );
};
