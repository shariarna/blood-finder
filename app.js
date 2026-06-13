// Global State
let map;
let userMarker;
let donorMarkersGroup;
let selectedLocation = null;
let isPickingLocation = false;
let activeBloodFilter = 'ALL';
let searchQuery = '';
let currentCoords = { lat: 23.8103, lng: 90.4125 }; // Default to Dhaka

// Elements
const donorsListEl = document.getElementById('donors-list');
const requestsListEl = document.getElementById('requests-list');
const searchInput = document.getElementById('search-input');
const bloodChips = document.querySelectorAll('.blood-chip');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Modals & Forms
const registerModal = document.getElementById('register-modal');
const requestModal = document.getElementById('request-modal');
const registerForm = document.getElementById('register-form');
const requestForm = document.getElementById('request-form');
const mapPickerBtn = document.getElementById('map-picker-btn');
const selectedCoordsEl = document.getElementById('selected-coordinates');
const centerIndicator = document.getElementById('center-indicator');

// Mock Data Seed
const mockDonors = [
  { id: 'd1', name: 'Kabir Ahmed', bloodGroup: 'O+', phone: '01712345678', lat: 23.7925, lng: 90.4078, address: 'Banani, Dhaka' },
  { id: 'd2', name: 'Sadia Rahman', bloodGroup: 'A+', phone: '01898765432', lat: 23.7561, lng: 90.3872, address: 'Dhanmondi, Dhaka' },
  { id: 'd3', name: 'Tanvir Hasan', bloodGroup: 'B+', phone: '01511223344', lat: 23.8041, lng: 90.3625, address: 'Mirpur-10, Dhaka' },
  { id: 'd4', name: 'Farhana Yeasmin', bloodGroup: 'AB+', phone: '01655667788', lat: 23.8759, lng: 90.3984, address: 'Uttara Sector 4, Dhaka' },
  { id: 'd5', name: 'Amit Sen', bloodGroup: 'O-', phone: '01912345999', lat: 23.7785, lng: 90.4150, address: 'Gulshan-1, Dhaka' },
  { id: 'd6', name: 'Imran Khan', bloodGroup: 'A-', phone: '01399887766', lat: 23.7342, lng: 90.4182, address: 'Motijheel, Dhaka' },
  { id: 'd7', name: 'Nabila Islam', bloodGroup: 'B-', phone: '01799008877', lat: 23.7252, lng: 90.3920, address: 'Lalbagh, Old Dhaka' }
];

const mockRequests = [
  { id: 'r1', patientName: 'Rahim Uddin', bloodGroup: 'A+', phone: '01811223344', quantity: '2 Bags', location: 'Dhaka Medical College Hospital', reason: 'Heart Surgery', date: '2026-06-12' },
  { id: 'r2', patientName: 'Laila Begum', bloodGroup: 'O+', phone: '01722334455', quantity: '1 Bag', location: 'Kurmitola General Hospital', reason: 'Thalassemia patient regular transfusion', date: '2026-06-14' }
];

// Initialize local storage database
function getDonors() {
  const local = localStorage.getItem('rakta_donors');
  if (!local) {
    localStorage.setItem('rakta_donors', JSON.stringify(mockDonors));
    return mockDonors;
  }
  return JSON.parse(local);
}

function saveDonor(donor) {
  const donors = getDonors();
  donors.push(donor);
  localStorage.setItem('rakta_donors', JSON.stringify(donors));
  showToast('নিবন্ধন সফল হয়েছে! (Registration Successful!)', 'success');
}

function getRequests() {
  const local = localStorage.getItem('rakta_requests');
  if (!local) {
    localStorage.setItem('rakta_requests', JSON.stringify(mockRequests));
    return mockRequests;
  }
  return JSON.parse(local);
}

function saveRequest(req) {
  const requests = getRequests();
  requests.push(req);
  localStorage.setItem('rakta_requests', JSON.stringify(requests));
  showToast('রক্তের অনুরোধ পোস্ট করা হয়েছে! (Request Posted!)', 'success');
}

// Calculate distance in km between two coords
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Page Load Setup
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupTabs();
  setupFilters();
  setupForms();
  setupMobileToggle();
  renderDonors();
  renderRequests();
  tryGeolocation();
});

// Map Logic
function initMap() {
  // Leaflet initialization
  map = L.map('map', {
    zoomControl: false // Custom placement later
  }).setView([currentCoords.lat, currentCoords.lng], 12);

  // CartoDB Dark Matter tiles (premium looking dark theme)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Add zoom control at bottom-right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Group for all donor markers
  donorMarkersGroup = L.layerGroup().addTo(map);

  // Add Locate Me custom button
  const locateControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const btn = L.DomUtil.create('a', 'map-control-btn', container);
      btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
      btn.title = 'আমার অবস্থান খুঁজুন (Locate Me)';
      
      L.DomEvent.on(btn, 'click', function(e) {
        L.DomEvent.stopPropagation(e);
        tryGeolocation(true);
      });
      return container;
    }
  });
  map.addControl(new locateControl());

  // Click handler on map for placing marker
  map.on('click', (e) => {
    if (isPickingLocation) {
      selectedLocation = e.latlng;
      selectedCoordsEl.style.display = 'flex';
      selectedCoordsEl.innerHTML = `<i class="fas fa-check-circle"></i> স্থান নির্বাচিত হয়েছে! (Lat: ${selectedLocation.lat.toFixed(4)}, Lng: ${selectedLocation.lng.toFixed(4)})`;
      
      // Update registration map pin button style
      mapPickerBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> অবস্থান পরিবর্তন করুন (Change Location)';
      mapPickerBtn.classList.add('active');
      
      // Highlight coordinates / temporarily draw a marker if needed
      isPickingLocation = false;
      centerIndicator.style.display = 'none';
      map.getContainer().style.cursor = '';
      
      // Focus back to modal
      openModal(registerModal);
      showToast('অবস্থান সফলভাবে চিহ্নিত করা হয়েছে! (Location marked!)', 'success');
    }
  });
}

function tryGeolocation(zoom = false) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        currentCoords = { lat: latitude, lng: longitude };

        // Set view
        if (zoom) {
          map.setView([latitude, longitude], 14);
        }

        // Draw user location marker
        if (userMarker) {
          userMarker.setLatLng([latitude, longitude]);
        } else {
          const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          userMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
          userMarker.bindPopup('<b>আপনার বর্তমান অবস্থান (Your Location)</b>');
        }
        
        // Re-render list to sort by distance
        renderDonors();
      },
      (error) => {
        console.warn('Geolocation error:', error);
        if (zoom) {
          showToast('অবস্থান নির্ধারণ করা যায়নি। জিপিএস চেক করুন। (Could not determine location)', 'error');
        }
      }
    );
  }
}

// Custom DivIcon for blood donors
function createDonorIcon(bloodGroup) {
  return L.divIcon({
    className: 'custom-donor-icon-container',
    html: `
      <div class="custom-donor-marker">
        <div class="marker-pin"></div>
        <div class="marker-text">${bloodGroup}</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30]
  });
}

// Setup tabs
function setupTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${target}-panel`).classList.add('active');
    });
  });
}

// Setup blood chips filters
function setupFilters() {
  bloodChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const blood = chip.dataset.blood;
      
      if (chip.classList.contains('active')) {
        chip.classList.remove('active');
        activeBloodFilter = 'ALL';
        // highlight 'All' if we want, or keep none active
      } else {
        bloodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeBloodFilter = blood;
      }
      
      renderDonors();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderDonors();
  });
}

// Render Donors to list & map
function renderDonors() {
  const donors = getDonors();
  donorMarkersGroup.clearLayers();
  
  // Clean container
  donorsListEl.innerHTML = '';

  // Filter and sort donors
  const filteredDonors = donors.filter(donor => {
    const matchesBlood = activeBloodFilter === 'ALL' || donor.bloodGroup === activeBloodFilter;
    const matchesSearch = donor.name.toLowerCase().includes(searchQuery) || donor.address.toLowerCase().includes(searchQuery);
    return matchesBlood && matchesSearch;
  });

  // Inject calculated distance if user position is known
  filteredDonors.forEach(donor => {
    donor.distance = getDistance(currentCoords.lat, currentCoords.lng, donor.lat, donor.lng);
  });

  // Sort by distance (closest first)
  filteredDonors.sort((a, b) => a.distance - b.distance);

  if (filteredDonors.length === 0) {
    donorsListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <p>কোনো রক্তদাতা পাওয়া যায়নি। (No donors found)</p>
      </div>
    `;
    return;
  }

  filteredDonors.forEach(donor => {
    // 1. Draw Map Marker
    const marker = L.marker([donor.lat, donor.lng], {
      icon: createDonorIcon(donor.bloodGroup)
    });

    // Create popup HTML
    const popupContent = `
      <div class="popup-donor">
        <div class="popup-header">
          <span class="popup-title">${donor.name}</span>
          <span class="popup-blood">${donor.bloodGroup}</span>
        </div>
        <div class="popup-detail">
          <div><i class="fas fa-phone"></i> <b>${donor.phone}</b></div>
          <div><i class="fas fa-map-marker-alt"></i> ${donor.address}</div>
          ${donor.distance ? `<div><i class="fas fa-route"></i> দূরত্ব: ${donor.distance.toFixed(1)} km দূরে</div>` : ''}
        </div>
        <div class="popup-actions">
          <a href="tel:${donor.phone}" class="btn btn-success"><i class="fas fa-phone-alt"></i> কল করুন</a>
          <a href="https://wa.me/88${donor.phone}" target="_blank" class="btn btn-secondary"><i class="fab fa-whatsapp"></i> মেসেজ</a>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent);
    donorMarkersGroup.addLayer(marker);

    // 2. Render list card
    const card = document.createElement('div');
    card.className = 'donor-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="donor-info">
          <span class="donor-name">${donor.name}</span>
          <span class="donor-dist">
            <i class="fas fa-map-marker-alt"></i> ${donor.address} 
            ${donor.distance ? `• ${donor.distance.toFixed(1)} km` : ''}
          </span>
        </div>
        <div class="blood-badge">${donor.bloodGroup}</div>
      </div>
      <div class="card-body">
        <div><i class="fas fa-phone-alt"></i> ${donor.phone}</div>
      </div>
      <div class="card-actions">
        <a href="tel:${donor.phone}" class="card-btn card-btn-call"><i class="fas fa-phone-alt"></i> কল (Call)</a>
        <a href="sms:${donor.phone}?body=Blood Finder: Hello, are you available to donate ${donor.bloodGroup} blood?" class="card-btn card-btn-chat"><i class="fas fa-sms"></i> এসএমএস (SMS)</a>
      </div>
    `;

    // Click on card flies map to donor location
    card.addEventListener('click', (e) => {
      // Don't trigger map fly if clicking direct call/sms action buttons
      if (e.target.closest('.card-btn')) return;
      
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        const appContainer = document.querySelector('.app-container');
        const toggleBtn = document.getElementById('mobile-toggle-btn');
        if (appContainer && toggleBtn) {
          appContainer.classList.add('show-map');
          toggleBtn.innerHTML = '<i class="fas fa-list"></i> <span>তালিকা দেখুন (View List)</span>';
        }
      }

      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          map.flyTo([donor.lat, donor.lng], 14, { animate: true, duration: 1.5 });
          marker.openPopup();
        }
      }, isMobile ? 150 : 0);
      
      // Briefly highlight card
      document.querySelectorAll('.donor-card').forEach(c => c.classList.remove('highlighted'));
      card.classList.add('highlighted');
    });

    donorsListEl.appendChild(card);
  });
}

// Render emergency requests to sidebar
function renderRequests() {
  const requests = getRequests();
  requestsListEl.innerHTML = '';

  if (requests.length === 0) {
    requestsListEl.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-ambulance"></i>
        <p>বর্তমানে কোনো জরুরি রক্তের অনুরোধ নেই। (No urgent blood requests)</p>
      </div>
    `;
    return;
  }

  requests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="donor-info">
          <span class="donor-name">${req.patientName}</span>
          <span class="donor-dist"><i class="fas fa-hospital"></i> ${req.location}</span>
        </div>
        <div class="blood-badge">${req.bloodGroup}</div>
      </div>
      <div class="card-body">
        <div><i class="fas fa-tint"></i> <b>পরিমাণ:</b> ${req.quantity}</div>
        <div><i class="fas fa-notes-medical"></i> <b>কারণ:</b> ${req.reason}</div>
        <div><i class="fas fa-calendar-alt"></i> <b>তারিখ বা সময়:</b> ${req.date}</div>
        <div><i class="fas fa-phone-alt"></i> <b>মোবাইল:</b> ${req.phone}</div>
      </div>
      <div class="card-actions">
        <a href="tel:${req.phone}" class="card-btn card-btn-call"><i class="fas fa-phone-alt"></i> যোগাযোগ করুন (Call)</a>
        <a href="https://wa.me/88${req.phone}?text=Blood Finder: রক্তদানের ব্যাপারে যোগাযোগ করছি।" target="_blank" class="card-btn card-btn-chat"><i class="fab fa-whatsapp"></i> হোয়াটসঅ্যাপ (WhatsApp)</a>
      </div>
    `;
    requestsListEl.appendChild(card);
  });
}

// Modal handling
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

function setupForms() {
  // Opening register modal
  document.getElementById('btn-register').addEventListener('click', () => {
    registerForm.reset();
    selectedLocation = null;
    mapPickerBtn.innerHTML = '<i class="fas fa-map-pin"></i> ম্যাপে অবস্থান চিহ্নিত করুন (Pin on Map)';
    mapPickerBtn.classList.remove('active');
    selectedCoordsEl.style.display = 'none';
    openModal(registerModal);
  });

  // Opening request modal
  document.getElementById('btn-request').addEventListener('click', () => {
    requestForm.reset();
    openModal(requestModal);
  });

  // Close modals clicking close button or backdrop
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeModal(e.target.closest('.modal-overlay'));
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  // Pick location toggle
  mapPickerBtn.addEventListener('click', () => {
    isPickingLocation = true;
    closeModal(registerModal);
    
    // Highlight picking mode on map
    centerIndicator.style.display = 'flex';
    map.getContainer().style.cursor = 'crosshair';
    
    showToast('ম্যাপের উপর আপনার অবস্থানে ক্লিক করুন! (Click on the map to pin your location)', 'info');
  });

  // Register Form Submit
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('reg-name').value.trim();
    const bloodGroup = document.getElementById('reg-blood').value;
    const phone = document.getElementById('reg-phone').value.trim();
    const address = document.getElementById('reg-address').value.trim();

    if (!selectedLocation) {
      showToast('অনুগ্রহ করে ম্যাপে আপনার অবস্থান চিহ্নিত করুন! (Please pin your location)', 'error');
      return;
    }

    // Validation
    if (name.length < 3) {
      showToast('নাম কমপক্ষে ৩ অক্ষরের হতে হবে। (Name must be >= 3 characters)', 'error');
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      showToast('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ ডিজিট)। (Enter a valid 11-digit BD phone number)', 'error');
      return;
    }

    const newDonor = {
      id: 'd_' + Date.now(),
      name,
      bloodGroup,
      phone,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      address: address || 'Dhaka, Bangladesh'
    };

    saveDonor(newDonor);
    closeModal(registerModal);
    renderDonors();
    
    // Fly to new donor location
    map.flyTo([newDonor.lat, newDonor.lng], 14);
  });

  // Request Form Submit
  requestForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const patientName = document.getElementById('req-name').value.trim();
    const bloodGroup = document.getElementById('req-blood').value;
    const phone = document.getElementById('req-phone').value.trim();
    const quantity = document.getElementById('req-quantity').value.trim();
    const location = document.getElementById('req-location').value.trim();
    const reason = document.getElementById('req-reason').value.trim();
    const date = document.getElementById('req-date').value;

    // Validation
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      showToast('সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ ডিজিট)।', 'error');
      return;
    }

    const newRequest = {
      id: 'r_' + Date.now(),
      patientName,
      bloodGroup,
      phone,
      quantity: quantity || '১ ব্যাগ (1 Bag)',
      location: location || 'Not Specified Hospital',
      reason: reason || 'Urgent Medical Emergency',
      date: date || new Date().toISOString().split('T')[0]
    };

    saveRequest(newRequest);
    closeModal(requestModal);
    renderRequests();
  });
}

// Custom Toast notification library
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : ''}`;
  
  let icon = '<i class="fas fa-info-circle"></i>';
  if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
  if (type === 'error') icon = '<i class="fas fa-exclamation-triangle"></i>';
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add('active');
  }, 10);
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Mobile View Toggling Logic
function setupMobileToggle() {
  const toggleBtn = document.getElementById('mobile-toggle-btn');
  const appContainer = document.querySelector('.app-container');

  if (!toggleBtn || !appContainer) return;

  toggleBtn.addEventListener('click', () => {
    const isShowingMap = appContainer.classList.toggle('show-map');

    if (isShowingMap) {
      toggleBtn.innerHTML = '<i class="fas fa-list"></i> <span>তালিকা দেখুন (View List)</span>';
      // Invalidate map size so Leaflet renders it fully when unhidden
      setTimeout(() => {
        if (map) map.invalidateSize();
      }, 100);
    } else {
      toggleBtn.innerHTML = '<i class="fas fa-map"></i> <span>ম্যাপ দেখুন (View Map)</span>';
    }
  });
}
