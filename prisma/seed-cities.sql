-- Insert Top 100 Major Cities of Pakistan
-- Run this on Supabase SQL Editor

INSERT INTO "City" (name, region, created_at) VALUES
-- Punjab (Major cities)
('Lahore', 'Punjab', NOW()),
('Faisalabad', 'Punjab', NOW()),
('Rawalpindi', 'Punjab', NOW()),
('Multan', 'Punjab', NOW()),
('Gujranwala', 'Punjab', NOW()),
('Sialkot', 'Punjab', NOW()),
('Bahawalpur', 'Punjab', NOW()),
('Sargodha', 'Punjab', NOW()),
('Sheikhupura', 'Punjab', NOW()),
('Jhang', 'Punjab', NOW()),
('Rahim Yar Khan', 'Punjab', NOW()),
('Gujrat', 'Punjab', NOW()),
('Kasur', 'Punjab', NOW()),
('Sahiwal', 'Punjab', NOW()),
('Okara', 'Punjab', NOW()),
('Wah Cantonment', 'Punjab', NOW()),
('Dera Ghazi Khan', 'Punjab', NOW()),
('Mirpur Khas', 'Punjab', NOW()),
('Kamoke', 'Punjab', NOW()),
('Mandi Burewala', 'Punjab', NOW()),
('Jhelum', 'Punjab', NOW()),
('Sadiqabad', 'Punjab', NOW()),
('Khanewal', 'Punjab', NOW()),
('Hafizabad', 'Punjab', NOW()),
('Muzaffargarh', 'Punjab', NOW()),
('Khanpur', 'Punjab', NOW()),
('Gojra', 'Punjab', NOW()),
('Mandi Bahauddin', 'Punjab', NOW()),
('Chiniot', 'Punjab', NOW()),
('Khushab', 'Punjab', NOW()),
('Attock', 'Punjab', NOW()),
('Chakwal', 'Punjab', NOW()),
('Vehari', 'Punjab', NOW()),
('Pakpattan', 'Punjab', NOW()),
('Toba Tek Singh', 'Punjab', NOW()),
('Bahawalnagar', 'Punjab', NOW()),
('Narowal', 'Punjab', NOW()),
('Kharian', 'Punjab', NOW()),
('Nankana Sahib', 'Punjab', NOW()),

-- Sindh (Major cities)
('Karachi', 'Sindh', NOW()),
('Hyderabad', 'Sindh', NOW()),
('Sukkur', 'Sindh', NOW()),
('Larkana', 'Sindh', NOW()),
('Nawabshah', 'Sindh', NOW()),
('Mirpur Khas', 'Sindh', NOW()),
('Jacobabad', 'Sindh', NOW()),
('Shikarpur', 'Sindh', NOW()),
('Khairpur', 'Sindh', NOW()),
('Dadu', 'Sindh', NOW()),
('Tando Adam', 'Sindh', NOW()),
('Tando Allahyar', 'Sindh', NOW()),
('Umerkot', 'Sindh', NOW()),
('Badin', 'Sindh', NOW()),
('Thatta', 'Sindh', NOW()),
('Sanghar', 'Sindh', NOW()),
('Ghotki', 'Sindh', NOW()),
('Kashmore', 'Sindh', NOW()),
('Matiari', 'Sindh', NOW()),
('Mithi', 'Sindh', NOW()),

-- Khyber Pakhtunkhwa (KPK)
('Peshawar', 'Khyber Pakhtunkhwa', NOW()),
('Mardan', 'Khyber Pakhtunkhwa', NOW()),
('Mingora', 'Khyber Pakhtunkhwa', NOW()),
('Abbottabad', 'Khyber Pakhtunkhwa', NOW()),
('Kohat', 'Khyber Pakhtunkhwa', NOW()),
('Dera Ismail Khan', 'Khyber Pakhtunkhwa', NOW()),
('Mansehra', 'Khyber Pakhtunkhwa', NOW()),
('Swabi', 'Khyber Pakhtunkhwa', NOW()),
('Charsadda', 'Khyber Pakhtunkhwa', NOW()),
('Nowshera', 'Khyber Pakhtunkhwa', NOW()),
('Bannu', 'Khyber Pakhtunkhwa', NOW()),
('Haripur', 'Khyber Pakhtunkhwa', NOW()),
('Swat', 'Khyber Pakhtunkhwa', NOW()),
('Karak', 'Khyber Pakhtunkhwa', NOW()),
('Hangu', 'Khyber Pakhtunkhwa', NOW()),
('Timergara', 'Khyber Pakhtunkhwa', NOW()),
('Chitral', 'Khyber Pakhtunkhwa', NOW()),
('Lakki Marwat', 'Khyber Pakhtunkhwa', NOW()),

-- Balochistan
('Quetta', 'Balochistan', NOW()),
('Turbat', 'Balochistan', NOW()),
('Hub', 'Balochistan', NOW()),
('Khuzdar', 'Balochistan', NOW()),
('Chaman', 'Balochistan', NOW()),
('Gwadar', 'Balochistan', NOW()),
('Sibi', 'Balochistan', NOW()),
('Zhob', 'Balochistan', NOW()),
('Dera Murad Jamali', 'Balochistan', NOW()),
('Loralai', 'Balochistan', NOW()),
('Pishin', 'Balochistan', NOW()),
('Kharan', 'Balochistan', NOW()),
('Usta Muhammad', 'Balochistan', NOW()),
('Mastung', 'Balochistan', NOW()),

-- Islamabad Capital Territory
('Islamabad', 'Islamabad Capital Territory', NOW()),

-- Gilgit-Baltistan
('Gilgit', 'Gilgit-Baltistan', NOW()),
('Skardu', 'Gilgit-Baltistan', NOW()),
('Hunza', 'Gilgit-Baltistan', NOW()),
('Chilas', 'Gilgit-Baltistan', NOW()),
('Ghanche', 'Gilgit-Baltistan', NOW()),

-- Azad Jammu & Kashmir (AJK)
('Muzaffarabad', 'Azad Jammu & Kashmir', NOW()),
('Mirpur', 'Azad Jammu & Kashmir', NOW()),
('Kotli', 'Azad Jammu & Kashmir', NOW()),
('Rawalakot', 'Azad Jammu & Kashmir', NOW()),
('Bagh', 'Azad Jammu & Kashmir', NOW()),
('Bhimber', 'Azad Jammu & Kashmir', NOW())

ON CONFLICT (name) DO NOTHING;

-- Verify the inserted data
SELECT region, COUNT(*) as city_count 
FROM "City" 
GROUP BY region 
ORDER BY city_count DESC;

