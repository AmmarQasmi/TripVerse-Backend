/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

// Use direct connection for seed (not pooled connection)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

/**
 * Hotel Seed Script
 * 
 * SAFE PRACTICES:
 * - Doesn't manually set IDs (lets auto-increment work)
 * - Checks for duplicates before creating
 * - Can run multiple times safely
 * - Uses transactions for consistency
 */

async function seedHotels() {
  console.log('\n🏨 Starting hotel seed...\n');

  // Get cities
  const karachi = await prisma.city.findFirst({ where: { name: 'Karachi' } });
  const lahore = await prisma.city.findFirst({ where: { name: 'Lahore' } });
  const islamabad = await prisma.city.findFirst({ where: { name: 'Islamabad' } });

  if (!karachi) {
    console.error('❌ No cities found! Please run city seed first.');
    return;
  }

  console.log(`✅ Found cities: Karachi (${karachi.id}), Lahore (${lahore?.id || 'N/A'}), Islamabad (${islamabad?.id || 'N/A'})\n`);

  const existingCount = await prisma.hotel.count();
  if (existingCount > 0) {
    console.log(`⚠️  Found ${existingCount} existing hotels. Seeding will ADD new hotels.\n`);
  }

  const hotelsData: any[] = [
    // KARACHI - Luxury
    {
      name: 'Pearl Continental Hotel Karachi',
      city_id: karachi.id,
      description: 'Experience luxury at its finest with 5-star facilities including rooftop pool, spa, and fine dining restaurants.',
      address: 'Club Road, Civil Lines, Karachi',
      star_rating: 5,
      amenities: ['wifi', 'pool', 'gym', 'restaurant', 'spa', 'parking', 'room-service'],
      images: [
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
        'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80',
        'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DELUXE',
          description: 'Spacious deluxe room with king-size bed, city view, work desk, and luxury bathroom.',
          max_occupancy: 2,
          base_price: 15000,
          total_rooms: 20,
          amenities: ['wifi', 'tv', 'mini-bar', 'safe', 'balcony'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
        },
        {
          name: 'SUITE',
          description: 'Executive suite with separate living area and panoramic city views.',
          max_occupancy: 4,
          base_price: 28000,
          total_rooms: 10,
          amenities: ['wifi', 'tv', 'mini-bar', 'safe', 'balcony', 'kitchenette'],
          images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80'],
        },
        {
          name: 'DOUBLE',
          description: 'Comfortable standard room with essential amenities.',
          max_occupancy: 2,
          base_price: 10000,
          total_rooms: 30,
          amenities: ['wifi', 'tv', 'safe'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
      ],
    },

    {
      name: 'Mövenpick Hotel Karachi',
      city_id: karachi.id,
      description: 'Beachfront luxury hotel with pristine Arabian Sea views and world-class spa facilities.',
      address: 'M.T. Khan Road, Karachi',
      star_rating: 5,
      amenities: ['wifi', 'pool', 'gym', 'restaurant', 'spa', 'beach-access', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80',
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DELUXE',
          description: 'Ocean-view deluxe room with premium bedding.',
          max_occupancy: 2,
          base_price: 18000,
          total_rooms: 25,
          amenities: ['wifi', 'tv', 'mini-bar', 'ocean-view'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
        },
        {
          name: 'SUITE',
          description: 'Beachfront suite with private balcony.',
          max_occupancy: 4,
          base_price: 35000,
          total_rooms: 8,
          amenities: ['wifi', 'tv', 'mini-bar', 'ocean-view', 'balcony'],
          images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80'],
        },
      ],
    },

    // KARACHI - Mid-Range
    {
      name: 'Avari Towers Karachi',
      city_id: karachi.id,
      description: 'Contemporary 4-star hotel in commercial hub with business center and dining options.',
      address: 'Fatima Jinnah Road, Karachi',
      star_rating: 4,
      amenities: ['wifi', 'gym', 'restaurant', 'business-center', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DOUBLE',
          description: 'Well-appointed standard room for business travelers.',
          max_occupancy: 2,
          base_price: 8500,
          total_rooms: 40,
          amenities: ['wifi', 'tv', 'work-desk'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
        {
          name: 'DELUXE',
          description: 'Spacious deluxe room with city views.',
          max_occupancy: 3,
          base_price: 12000,
          total_rooms: 20,
          amenities: ['wifi', 'tv', 'work-desk', 'mini-bar'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
        },
      ],
    },

    {
      name: 'Ramada Plaza Karachi',
      city_id: karachi.id,
      description: 'Modern hotel with rooftop restaurant and panoramic city views.',
      address: 'Airport Road, Karachi',
      star_rating: 4,
      amenities: ['wifi', 'restaurant', 'gym', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DOUBLE',
          description: 'Comfortable room with essential amenities.',
          max_occupancy: 2,
          base_price: 7500,
          total_rooms: 35,
          amenities: ['wifi', 'tv'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
        {
          name: 'DELUXE',
          description: 'Upgraded room with premium bedding.',
          max_occupancy: 3,
          base_price: 11000,
          total_rooms: 15,
          amenities: ['wifi', 'tv', 'mini-bar'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
        },
      ],
    },

    // KARACHI - Budget
    {
      name: 'Hotel Mehran Karachi',
      city_id: karachi.id,
      description: 'Value-for-money hotel with clean rooms and friendly service.',
      address: 'Shahrah-e-Faisal, Karachi',
      star_rating: 3,
      amenities: ['wifi', 'restaurant', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1496417263034-38ec4f0b665a?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DOUBLE',
          description: 'Clean and comfortable standard room.',
          max_occupancy: 2,
          base_price: 5000,
          total_rooms: 50,
          amenities: ['wifi', 'tv'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
      ],
    },

    {
      name: 'Beach Luxury Hotel',
      city_id: karachi.id,
      description: 'Seaside resort with private beach and water sports.',
      address: 'Sea View, Clifton, Karachi',
      star_rating: 4,
      amenities: ['wifi', 'pool', 'beach-access', 'restaurant', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DOUBLE',
          description: 'Comfortable room with sea view.',
          max_occupancy: 2,
          base_price: 9000,
          total_rooms: 30,
          amenities: ['wifi', 'tv', 'sea-view'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
        {
          name: 'DELUXE',
          description: 'Premium room with full sea view.',
          max_occupancy: 4,
          base_price: 14000,
          total_rooms: 20,
          amenities: ['wifi', 'tv', 'mini-bar', 'sea-view', 'balcony'],
          images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
        },
      ],
    },

    {
      name: 'Business Hub Hotel',
      city_id: karachi.id,
      description: 'Business hotel with meeting rooms and high-speed internet.',
      address: 'I.I. Chundrigar Road, Karachi',
      star_rating: 3,
      amenities: ['wifi', 'business-center', 'parking'],
      images: [
        'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200&q=80',
      ],
      roomTypes: [
        {
          name: 'DOUBLE',
          description: 'Efficient business room with work desk.',
          max_occupancy: 2,
          base_price: 6000,
          total_rooms: 45,
          amenities: ['wifi', 'tv', 'work-desk'],
          images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
        },
      ],
    },
  ];

  // Add Lahore hotels if city exists
  if (lahore) {
    hotelsData.push(
      {
        name: 'Faletti\'s Hotel Lahore',
        city_id: lahore.id,
        description: 'Historic luxury hotel with heritage architecture and modern comfort.',
        address: 'Egerton Road, Lahore',
        star_rating: 5,
        amenities: ['wifi', 'pool', 'gym', 'restaurant', 'spa', 'parking'],
        images: [
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
        ],
        roomTypes: [
          {
            name: 'DELUXE',
            description: 'Heritage-style deluxe room with traditional decor.',
            max_occupancy: 2,
            base_price: 14000,
            total_rooms: 18,
            amenities: ['wifi', 'tv', 'mini-bar'],
            images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
          },
          {
            name: 'SUITE',
            description: 'Luxurious suite with antique furnishings.',
            max_occupancy: 4,
            base_price: 25000,
            total_rooms: 8,
            amenities: ['wifi', 'tv', 'mini-bar', 'balcony'],
            images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80'],
          },
        ],
      },
      {
        name: 'Nishat Hotel Johar Town',
        city_id: lahore.id,
        description: 'Modern 4-star hotel in Johar Town with easy access to shopping.',
        address: 'Main Boulevard, Johar Town, Lahore',
        star_rating: 4,
        amenities: ['wifi', 'restaurant', 'gym', 'parking'],
        images: [
          'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80',
        ],
        roomTypes: [
          {
            name: 'DOUBLE',
            description: 'Comfortable standard room.',
            max_occupancy: 2,
            base_price: 7000,
            total_rooms: 30,
            amenities: ['wifi', 'tv'],
            images: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80'],
          },
        ],
      }
    );
  }

  // Add Islamabad hotels if city exists
  if (islamabad) {
    hotelsData.push(
      {
        name: 'Serena Hotel Islamabad',
        city_id: islamabad.id,
        description: 'Iconic 5-star luxury hotel at the foothills of Margalla Hills.',
        address: 'Khayaban-e-Suhrwardy, Islamabad',
        star_rating: 5,
        amenities: ['wifi', 'pool', 'gym', 'restaurant', 'spa', 'parking', 'garden'],
        images: [
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
        ],
        roomTypes: [
          {
            name: 'DELUXE',
            description: 'Elegant room with mountain views.',
            max_occupancy: 2,
            base_price: 16000,
            total_rooms: 22,
            amenities: ['wifi', 'tv', 'mini-bar', 'safe'],
            images: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],
          },
          {
            name: 'SUITE',
            description: 'Luxurious suite with living room.',
            max_occupancy: 4,
            base_price: 30000,
            total_rooms: 12,
            amenities: ['wifi', 'tv', 'mini-bar', 'safe'],
            images: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80'],
          },
        ],
      }
    );
  }

  // Insert hotels
  let createdCount = 0;
  let skippedCount = 0;

  for (const hotelData of hotelsData) {
    try {
      const existing = await prisma.hotel.findFirst({
        where: {
          name: hotelData.name,
          city_id: hotelData.city_id,
        },
      });

      if (existing) {
        console.log(`⏭️  Skipping "${hotelData.name}" (already exists)`);
        skippedCount++;
        continue;
      }

      const hotel = await prisma.$transaction(async (tx) => {
        const newHotel = await tx.hotel.create({
          data: {
            name: hotelData.name,
            city_id: hotelData.city_id,
            description: hotelData.description,
            address: hotelData.address,
            star_rating: hotelData.star_rating,
            amenities: hotelData.amenities,
            is_active: true,
          },
        });

        if (hotelData.images?.length > 0) {
          await tx.hotelImage.createMany({
            data: hotelData.images.map((url: string, index: number) => ({
              hotel_id: newHotel.id,
              image_url: url,
              display_order: index,
            })),
          });
        }

        if (hotelData.roomTypes?.length > 0) {
          for (const roomData of hotelData.roomTypes) {
            await tx.hotelRoomType.create({
              data: {
                hotel_id: newHotel.id,
                name: roomData.name,
                description: roomData.description,
                max_occupancy: roomData.max_occupancy,
                base_price: roomData.base_price,
                total_rooms: roomData.total_rooms,
                amenities: roomData.amenities || [],
                images: roomData.images || [],
                is_active: true,
              },
            });
          }
        }

        return newHotel;
      });

      console.log(`✅ Created "${hotel.name}" (ID: ${hotel.id}) with ${hotelData.roomTypes?.length || 0} room types`);
      createdCount++;

    } catch (error: any) {
      console.error(`❌ Error creating "${hotelData.name}":`, error.message);
    }
  }

  console.log('\n📊 Seed Summary:');
  console.log(`   ✅ Created: ${createdCount} hotels`);
  console.log(`   ⏭️  Skipped: ${skippedCount} hotels`);
  
  const totalHotels = await prisma.hotel.count();
  const totalRoomTypes = await prisma.hotelRoomType.count();
  const totalImages = await prisma.hotelImage.count();
  
  console.log(`\n📈 Database Totals:`);
  console.log(`   🏨 Hotels: ${totalHotels}`);
  console.log(`   🛏️  Room Types: ${totalRoomTypes}`);
  console.log(`   🖼️  Images: ${totalImages}`);
  console.log('\n✨ Hotel seed completed!\n');
}

seedHotels()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



