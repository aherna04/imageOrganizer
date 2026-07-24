import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import pkg from "../package.json";
import Home from "./pages/Home";
import Inbox from "./pages/Inbox";
import CalendarPage from "./pages/Calendar";
import EventsPage from "./pages/Events";
import PeoplePage from "./pages/People";
import TagsPage from "./pages/Tags";
import CamerasPage from "./pages/Cameras";
import BrowsePage from "./pages/Browse";
import Duplicates from "./pages/Duplicates";
import Blurry from "./pages/Blurry";
import Trash from "./pages/Trash";
import Mosaic from "./pages/Mosaic";
import Review from "./pages/Review";
import Settings from "./pages/Settings";

export default function App() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className={`app-shell${isHome ? " app-shell--home" : ""}`}>
      {!isHome && (
        <nav className="sidebar">
          <div className="sidebar-brand">
            <NavLink to="/" className="sidebar-brand-link">
              <h1>Image Organizer</h1>
            </NavLink>
            <p className="sidebar-version">{pkg.version}</p>
          </div>
          <NavLink to="/inbox" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Inbox
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Calendar
          </NavLink>
          <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Events
          </NavLink>
          <NavLink to="/people" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            People
          </NavLink>
          <NavLink to="/tags" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Tags
          </NavLink>
          <NavLink to="/cameras" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Cameras
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Browse
          </NavLink>
          <NavLink to="/mosaic" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Mosaic
          </NavLink>
          <NavLink to="/duplicates" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Duplicates
          </NavLink>
          <NavLink to="/blurry" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Blurry
          </NavLink>
          <NavLink to="/review" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Review
          </NavLink>
          <NavLink to="/trash" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Trash
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            Settings
          </NavLink>
        </nav>
      )}
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calendar/:year/:month" element={<CalendarPage />} />
          <Route path="/calendar/:year/:month/:day" element={<CalendarPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:slug" element={<EventsPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/cameras" element={<CamerasPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/browse/tags" element={<BrowsePage />} />
          <Route path="/browse/:kind/:slug" element={<BrowsePage />} />
          <Route path="/mosaic" element={<Mosaic />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/blurry" element={<Blurry />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
